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