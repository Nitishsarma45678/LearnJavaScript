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