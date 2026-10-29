const assert=require('node:assert/strict');
const path=require('node:path');
const converter=require(path.join(process.env.MN_READING_TEST_ROOT || path.join(__dirname,'../plugin/src'),'TitleCase.js'));
assert.equal(String.prototype.toTitleCasePro,undefined,'Local converter must not require or modify the legacy prototype');
for(const [input,expected] of [
 ['a course in functional analysis','A Course in Functional Analysis'],
 ['THE THEORY OF OPERATORS','The Theory of Operators'],
 ['1. 2. the basic_properties of operators iii','1.2. The Basic Properties of Operators III'],
 ['& functional analysis','§ Functional Analysis'],
 ['the continuous image of a compact space','The Continuous Image of a Compact Space'],
 ['on the theory of operators','On the Theory of Operators'],
 ['', '']
])assert.equal(converter.convert(input),expected);
console.log('Local Title Case: optimized small words, numerals, chapter formatting, underscores, section sign and no MN Utils dependency passed');
