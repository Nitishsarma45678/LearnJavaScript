// let num = [1,2,3,4,5];

// function sumArray(arr){
//     let sum = 0;
//     for(let i = 0 ; i<arr.length ; i ++){
//         sum += arr[i]
//     }
//     return sum;
// }

// console.log(sumArray(num))



// // 1. Print all elements of an array

// // Input: [1, 2, 3, 4, 5]
// // Output: 1 2 3 4 5


// let arr = [1, 2, 3 , 4, 5];
 
// for(i = 0 ; i <= arr.length ; i++){
//     console.log(arr[i]);                    //approach 1 
// }

// arr.forEach(element => console.log(element));   //approach 2 (.forEach method)





// // 2. Remove duplicates from an array

// // Input: [1, 2, 2, 3, 4, 4]
// // Output: [1, 2, 3, 4]


// let array = [1,2,2,3,4,4]

// let s = new Set(array);
//                                                    // Set: A Set in JavaScript stores only unique values.
//                                                   // Spread Operator (...): The spread operator is used to convert the Set back into an array.
// let array1 = [...s]

// console.log(array1);



// // 3.Find the sum of all elements in an array

// // Input: [10, 20, 30]
// // Output: 60

// let ar = [10 , 20, 30];

// let sum = 0;

// for (i =0 ; i< arr.length ; i ++){
//     sum+= ar[i]
// }
// console.log(sum)



// // 4. Find the largest element in an array

// // Input: [5, 1, 9, 3]
// // Output: 9


// function largestElement(array){
//     return Math.max(...array)
// }
// const number =  [5, 1, 9, 3] ;
// const result = largestElement(number);

// console.log(`Largest element: ${result}`);




// // 5. Find the smallest element in an array

// // Input: [8, 2, 4, 1, 7]
// // Output: 1


function smallestElement(arr){
    return Math.min(...arr)
}

let jarr =  [8, 2, 4, 1, 7];
let smallest = smallestElement(jarr);

console.log(`smallest one is: ${smallest}`);
