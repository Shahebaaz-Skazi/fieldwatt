function convertPg(sql) {
    let s = sql;
    s = s.replace(/(\b\w+(?:\.\w+)?)\s*->>\s*'([^']+)'/g, (match, p1, p2) => `json_extract(${p1}, '$."${p2}"')`);
    s = s.replace(/::[a-zA-Z_0-9]+(?:\[\])?/gi, '');
    s = s.replace(/~\s*'\^\\\[0-9\\\]\+\\$'/gi, "NOT GLOB '*[^0-9]*'");
    s = s.replace(/~\s*'\^\[0-9\]\+\$'/gi, "NOT GLOB '*[^0-9]*'");
    s = s.replace(/timezone\s*\(\s*'[^']*'\s*,\s*(.*?)\)/gi, '$1');
    s = s.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+(.*?)\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
    s = s.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+(.*?)\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
    s = s.replace(/\bILIKE\b/gi, 'LIKE');
    s = s.replace(/TO_CHAR\s*\(\s*(.*?)\s*,\s*'YYYY-MM-DD'\s*\)/gi, "strftime('%Y-%m-%d', $1)");
    s = s.replace(/\bTRUE\b/gi, '1');
    s = s.replace(/\bFALSE\b/gi, '0');
    s = s.replace(/\$(\d+)/g, '?');
    s = s.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*(.*?)\)/gi, "strftime('%Y-%m-01', $1)");
    s = s.replace(/date_trunc\s*\(\s*'month'\s*,\s*(.*?)\)/gi, "strftime('%Y-%m-01', $1)");
    s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
    s = s.replace(/\bCURRENT_DATE\s*\+\s*1\b/gi, "date('now', '+1 day')");
    s = s.replace(/\bCURRENT_DATE\s*-\s*5\b/gi, "date('now', '-5 days')");
    s = s.replace(/\bCURRENT_DATE\s*\+\s*25\b/gi, "date('now', '+25 days')");
    s = s.replace(/\bCURRENT_DATE\b(?!\s*[\+\-])/gi, "date('now')");
    s = s.replace(/datetime\('now'\)\s*-\s*INTERVAL\s*'7 days'/gi, "datetime('now', '-7 days')");
    return s;
}
const testSql = 'SELECT * FROM agents WHERE (UPPER(username) = ? OR UPPER(name) = ? OR phone = ?) AND is_active = 1';
console.log("Result:", convertPg(testSql));
