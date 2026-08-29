const fs = require('fs');
const path = require('path');
const db = require('../src/utils/db');

// List of completed phones provided by the user
const completedPhones = [
  '919169359693', '919422513859', '919860430422', '919822009626',
  '919673636642', '919423577272', '919822477377', '919623715151',
  '919820579865', '919225608179', '919822083682', '919423568277',
  '919371595603', '919822094364', '919766660716', '919850997050',
  '919881747260', '919226471310', '919822031039', '919850819927',
  '919420544784', '919850008920', '919960890100', '919923455377',
  '919421081216', '919850019988', '918766892237', '919623440704',
  '919823543123', '919689741625', '918446812734', '919422356776',
  '918087578300', '919822518080', '918805984500', '919822325167',
  '919881152266', '919422082716', '919970180960', '919850056633',
  '918806662489', '919850039187', '918308360401'
];

async function main() {
  console.log('Generating calling list...');

  // Get active cycle
  const cycleRes = await db.query("SELECT id, name FROM cycles WHERE is_active = 1 LIMIT 1");
  const cycle = cycleRes.rows[0];
  if (!cycle) {
    console.error('No active cycle found!');
    process.exit(1);
  }

  // Get all sent/delivered/read whatsapp logs with property details
  // and exclude those who have already submitted a reading in the active cycle
  const query = `
    SELECT 
      p.id as property_id,
      p.consumer_name,
      wl.phone_number,
      wl.sent_at,
      wl.status,
      a.name as area_name,
      p.society,
      p.meter_no
    FROM whatsapp_logs wl
    INNER JOIN properties p ON p.id = wl.property_id
    LEFT JOIN areas a ON a.id = p.area_id
    WHERE (wl.status IN ('sent', 'delivered', 'read') OR (date(wl.sent_at) = date('now') AND wl.status = 'failed'))
      AND p.id NOT IN (
        SELECT DISTINCT asg.property_id
        FROM readings r
        INNER JOIN assignments asg ON asg.id = r.assignment_id
        WHERE asg.cycle_id = ? AND r.status_code = 'reading_taken'
      )
    ORDER BY wl.sent_at ASC
  `;

  const res = await db.query(query, [cycle.id]);
  const allLogs = res.rows;

  console.log(`Found ${allLogs.length} total raw contacted logs without submissions.`);

  // Filter out duplicates and completed phone numbers
  const seenProperties = new Set();
  const callingList = [];

  for (const log of allLogs) {
    if (seenProperties.has(log.property_id)) continue;
    
    // Check if phone number is in completed list
    if (completedPhones.includes(log.phone_number)) continue;

    seenProperties.add(log.property_id);
    callingList.push({
      consumerName: log.consumer_name,
      phone: log.phone_number,
      sentAt: log.sent_at,
      status: log.status,
      areaName: log.area_name || 'N/A',
      society: log.society || 'N/A',
      meterNo: log.meter_no || 'N/A'
    });
  }

  // Sort: August 25 first, then other older dates, then today (August 29)
  callingList.sort((a, b) => {
    const dateA = new Date(a.sentAt);
    const dateB = new Date(b.sentAt);
    return dateA - dateB;
  });

  console.log(`Calling list filtered to ${callingList.length} unique properties.`);

  // Generate CSV contents
  let csvContent = 'Serial No.,Consumer Name,Phone Number,Sent At,Delivery Status,Area Zone,Society,Meter No.\n';
  callingList.forEach((c, idx) => {
    // Escape commas in names/addresses
    const name = c.consumerName.replace(/"/g, '""');
    const area = c.areaName.replace(/"/g, '""');
    const society = c.society.replace(/"/g, '""');
    const statusLabel = c.status === 'failed' ? 'Failed (Meta Restriction)' : 'Sent successfully';
    csvContent += `${idx + 1},"${name}",${c.phone},"${c.sentAt}","${statusLabel}","${area}","${society}","${c.meterNo}"\n`;
  });

  // Target CSV path in artifacts directory
  const artifactsDir = 'C:\\Users\\shahe\\.gemini\\antigravity\\brain\\8e78f988-96fa-4d5e-b56f-38016d5a2821';
  const csvPath = path.join(artifactsDir, 'calling_list.csv');
  
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log(`Successfully saved calling list to: ${csvPath}`);

  // Write a summary markdown file for the user to view as an artifact
  let mdContent = `# Customer Calling List\n\n`;
  mdContent += `This list contains all properties that received a WhatsApp reading request link but have **not** submitted their meter reading yet. The 43 completed/submitted customers have been filtered out.\n\n`;
  mdContent += `📁 **Download Full CSV File**: [calling_list.csv](file:///${csvPath.replace(/\\/g, '/')})\n\n`;
  mdContent += `## Calling Schedule\n\n`;
  
  const aug25 = callingList.filter(c => c.sentAt && c.sentAt.startsWith('2026-08-25'));
  const otherDays = callingList.filter(c => c.sentAt && !c.sentAt.startsWith('2026-08-25') && !c.sentAt.startsWith('2026-08-29'));
  const today = callingList.filter(c => c.sentAt && c.sentAt.startsWith('2026-08-29'));

  mdContent += `* **Batch 1 (Sent Aug 25 - Call Now)**: ${aug25.length} customers\n`;
  mdContent += `* **Batch 2 (Sent Aug 26/27 - Call Next)**: ${otherDays.length} customers\n`;
  mdContent += `* **Batch 3 (Sent Today Aug 29 - Call Tomorrow)**: ${today.length} customers\n\n`;

  mdContent += `### Batch 1: Sent Aug 25 (Call Now)\n\n`;
  if (aug25.length === 0) {
    mdContent += `*No pending customers from August 25.*\n`;
  } else {
    mdContent += `| # | Consumer Name | Phone Number | Area | Society | Sent At |\n`;
    mdContent += `|---|---|---|---|---|---|\n`;
    aug25.forEach((c, idx) => {
      mdContent += `| ${idx + 1} | **${c.consumerName}** | \`${c.phone}\` | ${c.areaName} | ${c.society} | ${c.sentAt} |\n`;
    });
  }

  mdContent += `\n### Batch 3: Sent Today Aug 29 (Call Tomorrow)\n\n`;
  mdContent += `> ⚠️ **Important Note for Batch 3**: Today's 250 messages were blocked/marked as **Failed** by Meta because of the temporary Commerce Policy restriction on the Facebook Page. They did **not** receive the WhatsApp text or link. When calling these customers, you will need to guide them or send their custom link manually.\n\n`;
  if (today.length === 0) {
    mdContent += `*No pending customers from today.*\n`;
  } else {
    mdContent += `| # | Consumer Name | Phone Number | Delivery Status | Area | Society | Sent At |\n`;
    mdContent += `|---|---|---|---|---|---|---|\n`;
    today.forEach((c, idx) => {
      const statusText = c.status === 'failed' ? '❌ Failed (Meta Restriction)' : '✅ Sent';
      mdContent += `| ${idx + 1} | **${c.consumerName}** | \`${c.phone}\` | ${statusText} | ${c.areaName} | ${c.society} | ${c.sentAt} |\n`;
    });
  }

  mdContent += `\n### Batch 2: Sent Aug 26/27 (Call Next)\n\n`;
  if (otherDays.length === 0) {
    mdContent += `*No pending customers from Aug 26/27.*\n`;
  } else {
    mdContent += `| # | Consumer Name | Phone Number | Area | Society | Sent At |\n`;
    mdContent += `|---|---|---|---|---|---|\n`;
    otherDays.forEach((c, idx) => {
      mdContent += `| ${idx + 1} | **${c.consumerName}** | \`${c.phone}\` | ${c.areaName} | ${c.society} | ${c.sentAt} |\n`;
    });
  }

  const mdPath = path.join(artifactsDir, 'calling_list.md');
  fs.writeFileSync(mdPath, mdContent, 'utf8');
  console.log(`Successfully saved markdown list to: ${mdPath}`);
}

main().catch(console.error).finally(() => process.exit(0));
