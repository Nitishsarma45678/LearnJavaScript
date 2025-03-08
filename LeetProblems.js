
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