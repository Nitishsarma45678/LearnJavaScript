// let num = [1,2,3,4,5];

// function sumArray(arr){
//     let sum = 0;
//     for(let i = 0 ; i<arr.length ; i ++){
//         sum += arr[i]
//     }
//     return sum;
// }

// console.log(sumArray(num))



// 1. Print all elements of an array

// Input: [1, 2, 3, 4, 5]
// Output: 1 2 3 4 5


let arr = [1, 2, 3 , 4, 5];
 
for(i = 0 ; i <= arr.length ; i++){
    console.log(arr[i]);                    //approach 1 
}

arr.forEach(element => console.log(element));   //approach 2 (.forEach method)