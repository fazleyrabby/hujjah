const lines = [
  "(1, 1, 1, 'In the name of Allah, the Entirely Merciful, the Especially Merciful.'),",
  "(7, 1, 7, 'The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.');",
  "(2, 1, 2, '[All] praise is [due] to Allah, Lord of the worlds -'),",
];

const regex = /^\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)\s*[,;]\s*$/;

for (const line of lines) {
  const m = line.match(regex);
  console.log(m ? `MATCH: ${m[2]}:${m[3]} -> ${m[4].slice(0, 40)}` : 'NO MATCH');
}
