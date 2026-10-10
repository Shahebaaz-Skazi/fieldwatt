const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const EXCEL_PATH = path.join(__dirname, '../FieldWatt_Second_Fix_Corrected_Readings_2026-09-25.xlsx');
const OUTPUT_HTML = path.join(__dirname, '../review_second_fix.html');

console.log('1. Reading Excel file...');
const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const allRows = xlsx.utils.sheet_to_json(sheet);

// Filter out the 1,496 already-completed rows — KEEP ONLY UNCOMPLETED!
const uncompletedRows = allRows.filter(r => !r['Corrected MR'] || String(r['Corrected MR']).trim() === '');
console.log(`   Total rows in Excel: ${allRows.length}`);
console.log(`   Already completed (set aside safely): ${allRows.length - uncompletedRows.length}`);
console.log(`   Uncompleted rows to review: ${uncompletedRows.length}`);

// Advanced Pattern Prediction Engine based on empirical analysis of user's 1,496 corrections
function predictReading(origStr, meterStr) {
  if (origStr === undefined || origStr === null) return { val: '0', rule: 'Empty' };
  const orig = String(origStr).trim();
  const meter = String(meterStr || '').trim().toUpperCase();

  // Rule 1: Decimal numbers (e.g. 12.604 -> 12)
  if (orig.includes('.')) {
    const intPart = orig.split('.')[0];
    return { val: intPart === '' ? '0' : intPart, rule: 'Dropped decimal digits (.xxx)' };
  }

  // Rule 2: <= 4 digits are already clean black-dial readings
  if (orig.length <= 4) {
    return { val: orig, rule: 'Clean reading (<= 4 digits)' };
  }

  // Rule 3: 5-digit numbers (or more)
  const drop2Prefixes = [
    'CAP', 'ZEN', 'ELS',
    'RAY19', 'RAY21', 'RAY22', 'RAY23', 'RAY24', 'RAYC', 'RAY20', 'RAY16'
  ];

  const isShortHot = meter.startsWith('HOT') && meter.length <= 7; // e.g. HOT1497, HOT1563 (older 2-dial meters)
  const isDrop2 = drop2Prefixes.some(p => meter.startsWith(p)) || isShortHot;

  if (isDrop2 && orig.length >= 5) {
    return { val: orig.slice(0, -2), rule: `Dropped 2 red dials (${meter.slice(0, 5)} model)` };
  }

  // Default: drop 1 red dial
  return { val: orig.slice(0, -1), rule: `Dropped 1 red dial (${meter.slice(0, 5)} model)` };
}

console.log('2. Predicting readings for remaining rows...');
const processed = uncompletedRows.map((r, uncompletedIdx) => {
  const prediction = predictReading(r['Original Submitted MR'], r['Device Serial No.']);

  return {
    origExcelIndex: allRows.indexOf(r) + 1,
    id: r['MR ORDER ID'] != null ? String(r['MR ORDER ID']) : '',
    bp: r['BP No.'] != null ? String(r['BP No.']) : '',
    name: r['BPNAME'] || '',
    meter: r['Device Serial No.'] || '',
    addr: [r['House Number'], r['Floor in building'], r['Street'], r['Area'], r['city']].filter(Boolean).join(', '),
    agent: r['Agent Name'] || 'Unknown',
    currentMR: r['Original Submitted MR'] != null ? String(r['Original Submitted MR']) : '',
    predVal: prediction.val,
    predRule: prediction.rule,
    url: r['Meter Photo URL'] || ''
  };
});

// Sort in Ascending Order by Predicted Reading Value
console.log('3. Sorting remaining 3,546 rows in ascending order of predicted reading...');
processed.sort((a, b) => {
  const numA = parseFloat(a.predVal) || 0;
  const numB = parseFloat(b.predVal) || 0;
  if (numA !== numB) return numA - numB;
  return a.origExcelIndex - b.origExcelIndex;
});

// Assign sorted sequence index
processed.forEach((item, idx) => {
  item.sortIndex = idx + 1;
});

console.log(`   Sample sorted: First is '${processed[0].predVal}', middle is '${processed[1773].predVal}', last is '${processed[processed.length - 1].predVal}'`);

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FieldWatt — Review Remaining 3,546 Readings (Ascending Order)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .img-container {
      overflow: hidden;
      cursor: grab;
      user-select: none;
    }
    .img-container:active { cursor: grabbing; }
    .img-zoom {
      transition: transform 0.08s ease-out;
      transform-origin: center center;
    }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 h-screen flex flex-col overflow-hidden">

  <!-- TOP HEADER -->
  <header class="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></span>
        <h1 class="text-lg font-bold tracking-tight text-white">Field<span class="text-cyan-400">Watt</span> Corrector <span class="text-[11px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded ml-1 font-mono">Remaining ${processed.length} • Sorted 0 $\\rightarrow$ 99999</span></h1>
      </div>
      <span class="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full font-mono font-medium" id="headerCount">Loading...</span>
    </div>

    <!-- Quick Navigation & Export -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <span>Jump to #</span>
        <input type="number" id="jumpInput" min="1" max="${processed.length}" class="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-center font-mono text-sm focus:border-cyan-400 outline-none" placeholder="1">
        <button onclick="jumpToRow()" class="bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded text-xs font-semibold">Go</button>
      </div>

      <div class="h-5 w-px bg-slate-700 mx-1"></div>

      <button onclick="exportExcel()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        Export Completed (<span id="savedCountBadge">0</span> / ${processed.length})
      </button>
    </div>
  </header>

  <!-- PROGRESS BAR -->
  <div class="w-full bg-slate-800 h-1.5">
    <div id="progressBar" class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 transition-all duration-200" style="width: 0%"></div>
  </div>

  <!-- MAIN SPLIT WORKSPACE -->
  <main class="flex-1 flex overflow-hidden">
    
    <!-- LEFT PANE: PHOTO VIEWER WITH PAN & ZOOM -->
    <section class="flex-1 bg-black relative flex flex-col items-center justify-center border-r border-slate-800">
      
      <!-- Zoom Controls Overlay -->
      <div class="absolute top-4 right-4 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-700 text-xs shadow-lg">
        <button onclick="adjustZoom(-0.25)" class="px-2 py-1 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm">−</button>
        <span id="zoomLevel" class="font-mono text-slate-300 min-w-[40px] text-center">100%</span>
        <button onclick="adjustZoom(0.25)" class="px-2 py-1 hover:bg-slate-700 rounded text-slate-300 font-bold text-sm">+</button>
        <button onclick="resetZoom()" class="px-2 py-1 hover:bg-slate-700 rounded text-slate-400 text-xs ml-1 border-l border-slate-700">Reset</button>
      </div>

      <!-- Instruction Hint -->
      <div class="absolute bottom-4 left-4 z-20 bg-slate-900/80 backdrop-blur px-3 py-1 rounded-md text-[11px] text-slate-400 border border-slate-800">
        Scroll wheel to Zoom • Drag to Pan
      </div>

      <!-- Image Pan/Zoom Surface -->
      <div id="imgContainer" class="img-container w-full h-full flex items-center justify-center">
        <img id="meterPhoto" src="" alt="Meter Photo" class="img-zoom max-w-full max-h-full object-contain pointer-events-none" />
        <div id="noPhotoNotice" class="hidden flex-col items-center justify-center text-slate-500 gap-2">
          <svg class="w-12 h-12 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span class="text-sm font-medium">No photo available for this property</span>
        </div>
      </div>
    </section>

    <!-- RIGHT PANE: DATA & RAPID VERIFICATION -->
    <aside class="w-[460px] bg-slate-850 p-6 flex flex-col justify-between overflow-y-auto border-l border-slate-800">
      
      <div class="space-y-5">
        
        <!-- Status & Badge -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs uppercase tracking-wider text-slate-400 font-semibold">Position</span>
            <span id="currentIndex" class="text-xl font-bold font-mono text-cyan-400">1</span>
            <span class="text-xs text-slate-500">of ${processed.length}</span>
            <span class="text-[11px] text-slate-400 border-l border-slate-700 pl-2">Excel Row #<span id="origRowNo" class="font-mono font-semibold text-slate-300">1</span></span>
          </div>
          <span id="reviewStatusBadge" class="text-[11px] px-2.5 py-0.5 rounded font-medium bg-slate-700 text-slate-300">Unreviewed</span>
        </div>

        <!-- Property Details Card -->
        <div class="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-3">
          <div>
            <div class="text-[11px] uppercase tracking-wider text-slate-400">Consumer Name</div>
            <div id="consumerName" class="text-base font-semibold text-white truncate">-</div>
          </div>
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div class="text-slate-400">BP Number</div>
              <div id="bpNo" class="font-mono text-slate-200 font-medium">-</div>
            </div>
            <div>
              <div class="text-slate-400">Order / Serial</div>
              <div id="orderId" class="font-mono text-slate-200 font-medium">-</div>
            </div>
            <div>
              <div class="text-slate-400">Meter Serial No</div>
              <div id="meterNo" class="font-mono text-slate-200 font-medium">-</div>
            </div>
            <div>
              <div class="text-slate-400">Agent Name</div>
              <div id="agentName" class="text-slate-200 truncate font-medium">-</div>
            </div>
          </div>
          <div>
            <div class="text-slate-400 text-[11px]">Address</div>
            <div id="address" class="text-xs text-slate-300 truncate">-</div>
          </div>
        </div>

        <!-- ORIGINAL WRONG READING DISPLAY -->
        <div class="bg-rose-950/40 border border-rose-800/50 rounded-xl p-3.5">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs uppercase font-bold tracking-wider text-rose-400">Submitted Wrong Reading</span>
            <span class="text-[10px] bg-rose-900/60 text-rose-300 px-2 py-0.5 rounded">Includes Red Dial</span>
          </div>
          <div id="wrongReading" class="text-2xl font-black font-mono tracking-wider text-rose-400">--</div>
        </div>

        <!-- AI PATTERN SUGGESTION BANNER -->
        <div class="bg-cyan-950/40 border border-cyan-500/40 rounded-xl p-3.5 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase font-bold tracking-wider text-cyan-300 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              AI Analyzed Reading
            </span>
            <span id="aiRuleBadge" class="text-[10px] text-cyan-300 bg-cyan-900/60 px-2 py-0.5 rounded font-mono truncate max-w-[200px]">Auto Pattern</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span id="aiSuggestedVal" class="text-2xl font-black font-mono text-cyan-300">--</span>
            <span class="text-[11px] text-cyan-400/80">Press <kbd class="px-1 bg-cyan-900 text-cyan-200 rounded font-mono font-bold">ENTER</kbd> to accept</span>
          </div>
        </div>

        <!-- VERIFICATION INPUT FORM -->
        <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <label for="correctInput" class="text-xs uppercase font-bold tracking-wider text-white">Final Corrected Reading</label>
            <span class="text-[11px] text-slate-400">Black digits only</span>
          </div>
          
          <input 
            type="text" 
            id="correctInput" 
            class="w-full bg-slate-900 border-2 border-cyan-500 focus:border-cyan-400 rounded-lg p-3 text-3xl font-mono font-bold tracking-wider text-white text-center outline-none shadow-inner focus:ring-4 focus:ring-cyan-500/20"
            autocomplete="off"
            autofocus
          />

          <div class="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-1">
            <span>Right? Just press</span>
            <kbd class="px-2 py-0.5 bg-cyan-500 text-slate-950 font-bold rounded text-xs font-mono shadow">ENTER ↵</kbd>
            <span>• Wrong? Type & press Enter</span>
          </div>
        </div>

      </div>

      <!-- BOTTOM ACTIONS -->
      <div class="space-y-3 pt-4 border-t border-slate-800">
        <div class="flex gap-2">
          <button onclick="prevItem()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1 transition">
            ← Prev (<kbd class="text-[10px] font-mono">P</kbd>)
          </button>
          <button onclick="skipItem()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1 transition">
            Skip (<kbd class="text-[10px] font-mono">S</kbd>)
          </button>
          <button onclick="saveAndNext()" class="flex-[2] bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-1.5 shadow-lg transition">
            Accept & Next ↵
          </button>
        </div>

        <button onclick="jumpToNextUnreviewed()" class="w-full text-cyan-400 hover:text-cyan-300 text-xs text-center py-1 font-semibold flex items-center justify-center gap-1">
          Jump to Next Unchecked Property ↷
        </button>
      </div>

    </aside>

  </main>

  <!-- EMBEDDED DATASET & LOGIC -->
  <script>
    const DATA = ${JSON.stringify(processed)};
    let currentIndex = 0;
    
    // Store user verified corrections: { id: { val, verified: true } }
    let corrections = {};

    // Zoom state
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    const STORAGE_KEY = 'fieldwatt_uncompleted_3546_v1';
    const STORAGE_KEY_IDX = 'fieldwatt_uncompleted_3546_last_idx';

    // Merge with any session storage in localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        corrections = JSON.parse(saved);
      }
      const savedIdx = localStorage.getItem(STORAGE_KEY_IDX);
      if (savedIdx) currentIndex = parseInt(savedIdx) || 0;
    } catch (e) {
      console.warn('Storage load error:', e);
    }

    // Elements
    const imgEl = document.getElementById('meterPhoto');
    const noPhotoNotice = document.getElementById('noPhotoNotice');
    const imgContainer = document.getElementById('imgContainer');
    const inputEl = document.getElementById('correctInput');
    const zoomLevelEl = document.getElementById('zoomLevel');

    function render() {
      if (currentIndex < 0) currentIndex = 0;
      if (currentIndex >= DATA.length) currentIndex = DATA.length - 1;

      const item = DATA[currentIndex];
      
      // Update Texts
      document.getElementById('currentIndex').textContent = item.sortIndex;
      document.getElementById('origRowNo').textContent = item.origExcelIndex;
      document.getElementById('headerCount').textContent = item.sortIndex + ' / ' + DATA.length;
      document.getElementById('consumerName').textContent = item.name || 'N/A';
      document.getElementById('bpNo').textContent = item.bp || '-';
      document.getElementById('orderId').textContent = item.id || '-';
      document.getElementById('meterNo').textContent = item.meter || '-';
      document.getElementById('agentName').textContent = item.agent || '-';
      document.getElementById('address').textContent = item.addr || '-';
      document.getElementById('wrongReading').textContent = item.currentMR || '-';
      document.getElementById('aiSuggestedVal').textContent = item.predVal;
      document.getElementById('aiRuleBadge').textContent = item.predRule;

      // Status Badge & Pre-filling Input
      const userRecord = corrections[item.id];
      const badge = document.getElementById('reviewStatusBadge');

      if (userRecord && userRecord.verified) {
        badge.textContent = '✓ Verified: ' + userRecord.val;
        badge.className = 'text-[11px] px-2.5 py-0.5 rounded font-medium bg-emerald-900/70 text-emerald-300 border border-emerald-700/60';
        inputEl.value = userRecord.val;
      } else {
        badge.textContent = 'AI Suggested (Press Enter)';
        badge.className = 'text-[11px] px-2.5 py-0.5 rounded font-medium bg-cyan-900/70 text-cyan-300 border border-cyan-700/60';
        // Pre-fill input with AI suggested reading!
        inputEl.value = item.predVal;
      }

      // Progress bar & Verified Counter
      const verifiedCount = Object.values(corrections).filter(c => c && c.verified).length;
      document.getElementById('savedCountBadge').textContent = verifiedCount;
      const pct = (verifiedCount / DATA.length) * 100;
      document.getElementById('progressBar').style.width = pct + '%';

      // Photo
      resetZoom();
      if (item.url) {
        imgEl.src = item.url;
        imgEl.classList.remove('hidden');
        noPhotoNotice.classList.add('hidden');
      } else {
        imgEl.classList.add('hidden');
        noPhotoNotice.classList.remove('hidden');
      }

      localStorage.setItem(STORAGE_KEY_IDX, currentIndex);
      preloadNextImages(currentIndex);

      // Auto-focus and highlight input so user can either press Enter immediately OR type over it
      inputEl.focus();
      inputEl.select();
    }

    function preloadNextImages(idx) {
      for (let offset = 1; offset <= 4; offset++) {
        const nextItem = DATA[idx + offset];
        if (nextItem && nextItem.url) {
          const img = new Image();
          img.src = nextItem.url;
        }
      }
    }

    function saveAndNext() {
      const item = DATA[currentIndex];
      let val = inputEl.value.trim();
      
      // If user left it empty or didn't type anything, take the AI suggestion!
      if (!val) {
        val = item.predVal;
      }

      corrections[item.id] = { val: val, verified: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));

      if (currentIndex < DATA.length - 1) {
        currentIndex++;
        render();
      }
    }

    function prevItem() {
      if (currentIndex > 0) {
        currentIndex--;
        render();
      }
    }

    function skipItem() {
      if (currentIndex < DATA.length - 1) {
        currentIndex++;
        render();
      }
    }

    function jumpToRow() {
      const val = parseInt(document.getElementById('jumpInput').value);
      if (val >= 1 && val <= DATA.length) {
        currentIndex = val - 1;
        render();
      }
    }

    function jumpToNextUnreviewed() {
      for (let i = currentIndex + 1; i < DATA.length; i++) {
        const rec = corrections[DATA[i].id];
        if (!rec || !rec.verified) {
          currentIndex = i;
          render();
          return;
        }
      }
      for (let i = 0; i < currentIndex; i++) {
        const rec = corrections[DATA[i].id];
        if (!rec || !rec.verified) {
          currentIndex = i;
          render();
          return;
        }
      }
      alert('All properties in this batch have been verified!');
    }

    // KEYBOARD SHORTCUTS
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveAndNext();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === inputEl) return;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 's') skipItem();
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'p') prevItem();
    });

    // ZOOM & PAN LOGIC
    function updateTransform() {
      imgEl.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${zoom})\`;
      zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
    }

    function adjustZoom(delta) {
      zoom = Math.max(0.5, Math.min(5, zoom + delta));
      if (zoom === 1) { panX = 0; panY = 0; }
      updateTransform();
    }

    function resetZoom() {
      zoom = 1;
      panX = 0;
      panY = 0;
      updateTransform();
    }

    imgContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      adjustZoom(delta);
    });

    imgContainer.addEventListener('mousedown', (e) => {
      if (zoom > 1) {
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => { isPanning = false; });

    // EXCEL EXPORT USING SHEETJS
    function exportExcel() {
      const exportData = DATA.map(r => {
        const rec = corrections[r.id];
        const finalVal = (rec && rec.val) ? rec.val : r.predVal;
        const status = (rec && rec.verified) ? 'USER_VERIFIED' : 'AI_SUGGESTED';

        return {
          'MR ORDER ID': r.id,
          'BP No.': r.bp,
          'BPNAME': r.name,
          'Device Serial No.': r.meter,
          'Original Submitted MR': r.currentMR,
          'Corrected MR': finalVal,
          'Correction Status': status,
          'Meter Photo URL': r.url
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Remaining 3546 Corrected');

      const fileName = 'FieldWatt_Remaining_3546_Corrected_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      XLSX.writeFile(wb, fileName);
    }

    // INITIAL RENDER
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
console.log('Successfully generated review_second_fix.html at: ' + OUTPUT_HTML);
