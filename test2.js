function translateParams(sql, params = []) {
  const matches = [...sql.matchAll(/\$(\d+)/g)];
  if (matches.length === 0) {
    return { sql, params };
  }
  const newParams = [];
  matches.forEach(m => {
    const index = parseInt(m[1], 10) - 1;
    newParams.push(params[index]);
  });
  const newSql = sql.replace(/\$(\d+)/g, '?');
  return { sql: newSql, params: newParams };
}
const q = translateParams('SELECT * FROM agents WHERE (UPPER(username) = $1 OR UPPER(name) = $1 OR phone = $1) AND is_active = 1', ['8446786687']);
console.log(q);
