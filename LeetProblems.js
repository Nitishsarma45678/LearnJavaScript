
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


console.log(maxCount([-2, -1, -1, 1, 2, 3]));

console.log(maxCount([-3, -2, -1, 0, 0, 1, 2])); 

console.log(maxCount([5, 20, 66, 1314])); 

