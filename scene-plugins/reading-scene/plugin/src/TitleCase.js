/* Optimized Title Case migrated from MN Utils xdyyutils.js on 2026-10-29.
 * Preserve existing small-word, Roman numeral, section and chapter handling.
 * Local implementation; no String.prototype or MN Utils dependency.
 */
var ReadingTitleCase = (function () {
  'use strict';
function convert(input) {
  'use strict'
  let smallWords = /^(a|an|and|as|at|but|by|en|for|if|in|nor|of|on|or|per|the|to|v.?|vs.?|via)$/i;
  let alphanumericPattern = /([A-Za-z0-9\u00C0-\u00FF])/;
  /* note there is a capturing group, so the separators will also be included in the returned list */
  let wordSeparators = /([ :–—-])/;
  let lowerBar = /_/g;
  /* regular expression: remove the space character, punctuation (.,;:!?), 
     dash and lower bar at both ends of the string */
  let trimBeginEndPattern = /^[\s.,;:!?_\-]*([a-zA-Z0-9].*[a-zA-Z0-9])[\s.,;:!?_\-]*$/g;
  let romanNumberPattern = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i;

  let title = String(input).toLowerCase().replace(trimBeginEndPattern,"$1")
    .replace(lowerBar, " ")
    .split(wordSeparators)
    .map(function (current, index, array) {
      if (
        /* Check for small words */
        current.search(smallWords) > -1 &&
        /* Skip first and last word */
        index !== 0 &&
        index !== array.length - 1 &&
        /* cope with the situation such as: 1. the conjugation operator */
        array.slice(0,index-1).join('').search(/[a-zA-Z]/) > -1 &&
        /* Ignore title end and subtitle start */
        array[index - 3] !== ':' &&
        array[index + 1] !== ':' &&
        /* Ignore small words that start a hyphenated phrase */
        (array[index + 1] !== '-' ||
          (array[index - 1] === '-' && array[index + 1] === '-'))
      ) {
        return current.toLowerCase()
      }
      
      /* Uppercase roman numbers */
      if (current.search(romanNumberPattern) > -1) {
        return current.toUpperCase();
      }

      /* Ignore intentional capitalization */
      if (current.substring(1).search(/[A-Z]|\../) > -1) {
        return current;
      }

      /* Ignore URLs */
      if (array[index + 1] === ':' && array[index + 2] !== '') {
        return current;
      }

      /* Capitalize the first letter */
      return current.replace(alphanumericPattern, function (match) {
        return match.toUpperCase();
      })
    })
    .join('') // convert the list into a string

  if (title.startsWith('&')) {
    title = title.replace('&', '§');
  }
  title = title.replace(/\s+/g, ' ');
  
  let chapterRegex = /^(?:\d+\s*\.\s*)+\d+\s*\.?\s*/;
  if (chapterRegex.test(title)) {
    // 提取章节编号部分
    let chapterMatch = title.match(chapterRegex)[0];
    // 去掉章节编号中的多余空格
    let normalizedChapter = chapterMatch.replace(/\s+/g, '');
    normalizedChapter += " "
    // 替换原字符串中的章节编号部分
    title = title.replace(chapterMatch, normalizedChapter);
  }
  return title;
}

  return {convert:convert};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ReadingTitleCase;
