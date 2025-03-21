// Here We are Implementing "Two Pointer" approach with various example problems.

//Find two numbers in a sorted array that add up to a specific target. 

function twoSumArray(arr , target){
    let left = 0;
    let right = arr.length - 1

    while(left < right ){
        const sum = arr[left] + arr[right];

        if(sum === target){
            return [left , right]
        }
        else if(sum < target){
            left ++
        }
        else{
            right --
        }
    }
    return[]
}

let array = [2, 3, 4, 5, 6, 7, 8]
let target = 9 ;

console.log(twoSumArray(array , target));




// Another approach (Works on both unsorted and sorted arrays.)
// But Inefficient for Larger Arrays

function twoSum(arr , target){
    let n = arr.length;

    for (let i = 0 ; i < n ; i++){   //interate through each element
        
        for(let j = i + 1 ; j < n ; j++ ){     //Check every other element arr[j] that comes after arr[i]

            if (arr[i] + arr[j] === target){
                return true;
            }

        }
    }
    return false;
}

let arr = [0, -1, 2, -3, 1];
let target1 = -2;

// Call the twoSum function and print the result
if (twoSum(arr, target))
    console.log("true");
else 
    console.log("false");







// Problem: Given a sorted array, find if there exists a pair of numbers that add up to a given target.

//Input: arr = [1, 2, 3, 4, 6], target = 6

function newFunction(arr , target){
    let left = 0;
    let right = arr.length - 1;

    while (left < right){
        const sum = arr[left] + arr[right]

        if (sum === target){
            return [left , right]
        }
        else if (sum < target){
            left ++
        }
        else {
            right --
        }
    }
    return []
}

let inputArray =  [1, 2, 3, 4, 6];
let target2 = 6;

console.log(newFunction(inputArray, target2));







//Problem: Given a sorted array, remove all duplicate elements in-place and return the length of the modified array.
//Input: arr = [1, 1, 2, 2, 3, 4, 4]

function removeDuplicates(arr) {
    if (arr.length === 0) return 0;

    let i = 0; 

    for (let j = 1; j < arr.length; j++) {
        if (arr[j] !== arr[i]) {
            i++;
            arr[i] = arr[j]; 
        }
    }
    
    return i + 1;
}


const arr23 = [1, 1, 2, 2, 3, 4, 4];
const length = removeDuplicates(arr23);
console.log(arr23.slice(0, length));







// Problem: Array Reverse
// Input: arr[] = {1, 4, 3, 2, 6, 5}  
// Output: {5, 6, 2, 3, 4, 1}

function revArr(arr){
    let left = 0 ;           
    let right = arr.length -1;

    while (left < right){
        [arr[left] , arr[right]] = [arr[right] , arr[left]];

        left ++;

        right --;

    }
}

let theArr = [1, 4, 3, 2, 6, 5]
console.log(revArr(theArr));
console.log(theArr.join(" "));