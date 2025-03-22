// 1. Given an array arr[], the task is to print every alternate element of the array starting from the first element.

// Examples:

// Input: arr[] = [10, 20, 30, 40, 50]
// Output: 10 30 50
// Explanation: Print the first element (10), skip the second element (20), print the third element (30), skip the fourth element(40) and print the fifth element(50).


function getAlternates(arr){
    let a = []

    for (i = 0; i < arr.length; i+=2){
        a.push(arr[i]);
    }
    return a;
}

let arr = [10 , 20 , 30 , 40 , 50 , 60]
console.log(getAlternates(arr).join(' '));






// 2. Linear Search Algorithm
// Input: arr[] = [1, 2, 3, 4], x = 3
// Output: 2
// Explanation: There is one test case with array as [1, 2, 3 4] and element to be searched as 3. Since 3 is present at index 2, the output is 2.

function linearFind(arr , target){
    for(i = 0; i < arr.length ; i++){
        if (arr[i] == target){
            return i;
        }
    }
    return -1;
}
 
let inArr = [1, 2, 3, 4]
let target = 3 ;    // x value

console.log(linearFind(inArr , target));







// 3. Largest element in an Array
// Given an array arr. The task is to find the largest element in the given array. 

// Examples: 

// Input: arr[] = [10, 20, 4]
// Output: 20
// Explanation: Among 10, 20 and 4, 20 is the largest. 

// Input: arr[] = [20, 10, 20, 4, 100]
// Output: 100


function findLargestElement(arr){
    return Math.max(...arr)
}

let arr1 =  [10, 20, 4] ;
let arr2 =   [20, 10, 20, 4, 100] ;

console.log(findLargestElement(arr1))
console.log(findLargestElement(arr2))

//another way of doing it ⬇️

function findTheNo(array){
    let max = array[0];

    for(let i = 0 ; i < array.length ; i++){
        if (array[i] > max){
            max = arr[i]
        }
    }
    return max;

}

let arr12 =  [10, 20, 4] ;
let arr23 =   [20, 10, 20, 4, 100] ;

console.log(findLargestElement(arr12))
console.log(findLargestElement(arr23))





// 4.Second Largest Element in an Array
// Given an array of positive integers arr[] of size n, the task is to find second largest distinct element in the array.

// Note: If the second largest element does not exist, return -1.

// Examples:

// Input: arr[] = [12, 35, 1, 10, 34, 1]
// Output: 34
// Explanation: The largest element of the array is 35 and the second largest element is 34.

function secondLar(array){
    n = array.length;

    for (let i = n - 2 ; i >= 0 ; i --){
        if(array[i] !== array[n-1]){
            return array[i];
        }
    }
    return -1;
}

let fh = [12, 35, 1, 10, 34, 1];
console.log(secondLar(fh));





// 5. Remove duplicates from Sorted Array

// Input: arr[] = [2, 2, 2, 2, 2]
// Output: [2]
// Explanation: All the elements are 2, So only keep one instance of 2.

// Input: arr[] = [1, 2, 2, 3, 4, 4, 4, 5, 5]
// Output: [1, 2, 3, 4, 5]

// Input: arr[] = [1, 2, 3]
// Output: [1, 2, 3]
// Explanation : No change as all elements are distinct.


function removeDupli(array){
    let s = new Set();

    let theIndex = 0;

    for (let i = 0; i<array.length ; i++){
        if(!s.has(array[i])){
            s.add(array[i])
            array[theIndex++] =  array[i]
        }
    }
}

let a1 = [2, 2, 2, 2, 2]
let b2 = [1, 2, 2, 3, 4, 4, 4, 5, 5]
let c3 = [1, 2, 3]

const newSizeA = removeDupli(a1);
const newSizeB = removeDupli(b2);
const newSizeC = removeDupli(c3);

console.log(a1.slice(0, newSizeA).join(' '));
console.log(b2.slice(0, newSizeB).join(' '));
console.log(c3.slice(0, newSizeC).join(' '));






// 4.Generating All Subarrays
// Last Updated : 07 Feb, 2025
// Given an array arr[], the task is to generate all the possible subarrays of the given array.

// Examples: 

// Input: arr[] = [1, 2, 3]
// Output: [ [1], [1, 2], [2], [1, 2, 3], [2, 3], [3] ]

// Input: arr[] = [1, 2]
// Output: [ [1], [1, 2], [2] ]


function findSubArr(arr){
    const n = arr.length;

    for(let i = 0 ; i < n ; i++){

        for (let j = i ; j < n ; j++){

            let subArr = [];

            for (let k = i ; k <= j ; k++){
                subArr.push(arr[k]);
            }
            console.log(subArr.join(" "))
        }
    }
}

let inArr1 = [1, 2, 3];
let inArr2 = [1, 2];

console.log(findSubArr(inArr1))
console.log(findSubArr(inArr2))




// 5. Array Reverse 
// Input: arr[] = {1, 4, 3, 2, 6, 5}  
// Output: {5, 6, 2, 3, 4, 1}
// Explanation: The first element 1 moves to last position, the second element 4 moves to second-last and so on.


function reverseArr(array){
    let reversed = []

    for(let i = array.length - 1 ; i>= 0; i--){
        reversed.push(array[i]);
    }
    return reversed;
}

let nwArr = [1, 4, 3, 2, 6, 5]
console.log(reverseArr(nwArr));





// 6.Rotate an Array
// input arr[] = {1, 2, 3, 4, 5, 6}, d = 2.

function rotateArr(arr, k){
    k = k % arr.length;

    for(let i = 0; i < k; i++){
        arr.unshift(arr.pop())
    }
    return arr;
}

inreArr = [1, 2, 3, 4, 5, 6]
k = 2;

console.log(rotateArr(inreArr,k));






// 7. Find Largest Element in an Array
// Input : [10, 15, 38, 20, 13];
// Output: 38


function findLargest(arr){
    return Math.max(...arr);
}

let theArrin = [10, 15, 38, 20, 13];
console.log(findLargest(theArrin));

//another way of doing it ⬇️

function findTheLar(arr){
    let theLar = arr[0];

    for(let i = 1 ; i < arr.length ; i++){
        if(arr[i] > theLar){
            theLar = arr[i];
        }
    }
    return theLar;
}

let thArr = [10, 15, 38, 20, 13];
console.log(findTheLar(theArrin));





// 8.Check an Array is Sorted or Not
// Input : const arr = [1, 2, 3, 4, 5]; 
// Output : true
// Input : const arr = [3, 1, 4, 2, 5];
// Output : false


function sorTarrCheck(arr){
    for(let i = 0 ; i < arr.length - 1; i++){
        if(arr[i] > arr[i + 1]){
            return false;
        }
    }
    return true;
}


let chekArr = [1, 2, 3, 4, 5]; 
let chekArr2 = [3, 1, 4, 2, 5];

console.log(sorTarrCheck(chekArr))
console.log(sorTarrCheck(chekArr2))





// 9.Left Rotate by One in an Array

function leftRotateByOne(arr) {
    const temp = arr[0];
    for (let i = 0; i < arr.length - 1; i++) {
        arr[i] = arr[i + 1];
    }
    arr[arr.length - 1] = temp;
    return arr;
}
const arrTy = [1, 2, 3, 4, 5];
console.log("Rotated Array:", leftRotateByOne(arr));
