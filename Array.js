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



// 3.Find the sum of all elements in an array

// Input: [10, 20, 30]
// Output: 60

let ar = [10 , 20, 30];

let sum = 0;

for (i =0 ; i< arr.length ; i ++){
    sum+= ar[i]
}
console.log(sum)



// 4. Find the largest element in an array

// Input: [5, 1, 9, 3]
// Output: 9


function largestElement(array){
    return Math.max(...array)
}
const number =  [5, 1, 9, 3] ;
const result = largestElement(number);

console.log(`Largest element: ${result}`);




// 5. Find the smallest element in an array

// Input: [8, 2, 4, 1, 7]
// Output: 1


function smallestElement(arr){
    return Math.min(...arr)
}

let jarr =  [8, 2, 4, 1, 7];
let smallest = smallestElement(jarr);

console.log(`smallest one is: ${smallest}`);



// Check if an array contains a specific element

// Input: arr = [10, 20, 30], element = 20
// Output: true

let raa = [10, 20, 30];

let theElement = 20

let found = false

for(i = 0; i < raa.length ; i++){
    if (raa[i] === theElement){
        found = true;
        break;
    }
}

console.log(found);



// Reverse an array

// Input: [1, 2, 3, 4]
// Output: [4, 3, 2, 1]

let jak = [1,2,3,4]

let reversedArray = jak.reverse();

console.log(reversedArray);



// // Rotate an array by k positions

// // Input: [1, 2, 3, 4, 5], k = 2
// // Output: [4, 5, 1, 2, 3]


function rotateAnArray(arr, k){
    k = k % arr.length;
    for (i = 0 ; i < k; i ++){
        arr.unshift(arr.pop());
    }
    return arr;
}


let inputArray = [1, 2, 3, 4, 5];
let k = 2;



console.log(rotateAnArray(inputArray , k));




// Sorting An Array 

// Simple sorting in case of the array is containing strings -

let unsortArr = ["zomato" , "bigbasket" , "zepto" , "swiggy" , "blinkit"]

console.log(unsortArr.sort());

//As .sort() converts the array values to strings and compares there unicode values for sorting, it becomes a problem for sorting numeric values so we can do ---

let asArr = [2,3,10,5,32,7,8,1,90,45,823]
console.log(asArr.sort((a , b) => a - b))

//for descending order .sort((a,b) => b - a)




//sort in reverse order
let a = ["JS", "HTML", "CSS"];
console.log(a);
a.sort((x, y) => x.localeCompare(y))
console.log(a);

console.log(a.sort().reverse()) //can be done like this also





// Find the second largest element in an array

// Input: [10, 5, 8, 20]
// Output: 10

function getSecondLargest(arr) {
    let n = arr.length;

    arr.sort((a, b) => a - b);
 
    for (let i = n - 2; i >= 0; i--) {
        if (arr[i] !== arr[n - 1]) {
            return arr[i];
        }
    }

    // If no second largest element exists, return -1
    return -1;
}


//Reverse an Array without using .reverse() method 

let AnArray = [2, 7, 9, 3, 5, 1];

function reverseArray(arr){
    let reversed = [];
    for (let i = arr.length - 1 ; i>=0 ; i--){
        reversed.push(arr[i]);
    }
    return reversed;
}

let reversed  =  reverseArray(AnArray);

console.log("Original Array : ", AnArray);
console.log("Reversed array : ", reversed);




// Create an Multidimensional Array 
// Creating a 2D Array 

let matrix = [
              [1, 2, 3],
              [4, 5, 6], 
              [7, 8, 9]
];

console.log(matrix);
console.log(matrix[2][2])



