let num = [1,2,3,4,5];

function sumArray(arr){
    let sum = 0;
    for(let i = 0 ; i<arr.length ; i ++){
        sum += arr[i]
    }
    return sum;
}

console.log(sumArray(num))



// 1. Print all elements of an array

// Input: [1, 2, 3, 4, 5]
// Output: 1 2 3 4 5


let arr = [1, 2, 3 , 4, 5];
 
for(i = 0 ; i <= arr.length ; i++){
    console.log(arr[i]);                    //approach 1 
}

arr.forEach(element => console.log(element));   //approach 2 (.forEach method)





// 2. Remove duplicates from an array

// Input: [1, 2, 2, 3, 4, 4]
// Output: [1, 2, 3, 4]


let array = [1,2,2,3,4,4]

let s = new Set(array);
                                                   // Set: A Set in JavaScript stores only unique values.
                                                  // Spread Operator (...): The spread operator is used to convert the Set back into an array.
let array1 = [...s]

console.log(array1);
