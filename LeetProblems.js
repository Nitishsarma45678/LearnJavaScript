
// 217. Contains Duplicate
// Difficulty: Easy

let testArray = [1,2,3,1]

let s = new Set(testArray)

if( s.size != testArray.length){
    console.log(true);
}
else{
    console.log(false);
}

// <<----------------------------------------------------------------------------------------------------->>

// 242. Valid Anagram
// Difficulty: Easy

function isSame(g,t){
    if (g.length != t.length){
        return false;
    }
    return g.split('').sort().join('') === t.split('').sort().join('');

}

let g = "anagram"
let t = "nagaram"

console.log(isSame(s,t));



// <<----------------------------------------------------------------------------------------------------->>



// 2529. Maximum Count of Positive Integer and Negative Integer
// Difficulty: Easy

function findMaxCount(nums){
    let pos = 0;
    let neg = 0;

    for (let num of nums){
        if (num > 0){
            pos++ ;
        }
        else if(num < 0){
            neg++ ;
        }
    }
    return Math.max(pos , neg);
}


console.log(findMaxCount([-2, -1, -1, 1, 2, 3]));

console.log(findMaxCount([-3, -2, -1, 0, 0, 1, 2])); 

console.log(findMaxCount([5, 20, 66, 1314])); 



// <<----------------------------------------------------------------------------------------------------->>



// 9. Palindrome Number
// Difficulty: Easy

function checkPalin(x){
    if (x < 0){
        return false;
    }

    const str = x.toString();

    const reversedStr = str.split('').reverse().join('')

    return str === reversedStr;
}

console.log(checkPalin(121))
console.log(checkPalin(-121))
console.log(checkPalin(10))



// <<----------------------------------------------------------------------------------------------------->>



//28. Find the Index of the First Occurrence in a String
// Difficulty: Easy

function strStr(haystack, needle) {
    return haystack.indexOf(needle);
}


console.log(strStr("sadbutsad", "sad")); 
console.log(strStr("leetcode", "leeto")); 



// <<----------------------------------------------------------------------------------------------------->>


// 12. Integer to Roman
// Difficulty : Medium

function intToRoman(num) {
    const romanMap = {
        1000: 'M',
        900: 'CM',
        500: 'D',
        400: 'CD',
        100: 'C',
        90: 'XC',
        50: 'L',
        40: 'XL',
        10: 'X',
        9: 'IX',
        5: 'V',
        4: 'IV',
        1: 'I'
    };

    let roman = '';

    const values = Object.keys(romanMap).reverse().map(Number); 

    for (let value of values) {
        while (num >= value) {
            roman += romanMap[value]; 
            num -= value; 
        }
    }
    return roman;
}


console.log(intToRoman(3749)); 
console.log(intToRoman(58));   
console.log(intToRoman(1994)); 
