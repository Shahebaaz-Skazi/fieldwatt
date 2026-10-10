async function test() {
  const url = "https://pub-3de6f3ace1d04d558c47c0e7df5f333d.r2.dev/5eef6816-753f-4a71-af23-23ebf982cb0a/1791194373868_meter_1791194374036.jpg";
  const res = await fetch(url);
  console.log(res.status);
  console.log(await res.text());
}
test();
