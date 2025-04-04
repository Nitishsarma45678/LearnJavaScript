//1. Print Numbers from 1 to 10
//Write a program to print numbers from 1 to 10 using a loop.

for(i = 0; i<=10; i++){
    console.log(i);
}

//2. Sum of Two Numbers
//Take two numbers as input and print their sum

let k = 12;
let n = 32;

console.log(k + n);

//3. Even or Odd
//Write a program that takes a number as input and prints whether it's even or odd.

const num = parseInt(prompt("Enter the no. : "));

if(num % 2 === 0){
    console.log(`${num} is even`);
}
else{
    console.log(`${num} is odd`);
}

//4. Find the Largest Number
//Take three numbers as input and print the largest among them.

const a = parseInt (prompt("Enter first no.: "));
const b = parseInt (prompt("Enter Second no.: "));
const c = parseInt (prompt("Enter Third no.: "));

const largeElement = Math.max(a,b,c);

console.log(`Largest no will be :${largeElement}`);




// 5. Reverse a String
// Write a program to reverse a string. For example, "hello" should become "olleh".

let inputString = prompt("Enter a String: ");
let reversedString = inputString.split("").reverse().join("");

console.log(`The reversed string : ${reversedString}`)



//Check if a variable is an Array

let tryArr = [1 , 2 , 3 , 4]

let findout = Array.isArray(tryArr);   //using  Array.isArray method.

console.log(findout);



//imp note : 
// 1. Variables that are created inside a function are local variables, and local variables can only be referred to by the code within the function.
// 2. Variables created outside of functions are global variables, and the code in all functions has access to all global variables.




// JavaScript Function Call 


function product(a, b) {
    return a * b;
}

// Calling product() function
let result23 = product.call(this, 20, 5);

console.log(result);





// Arrow Functions 

const Adding = (a , b) => a + b ;
console.log(Adding(9 , 2));

// without the parameters also 

const printText = () => {
    console.log("this is good")
}
printText()




// with single and multiple parameters


const newFunction = a => a * a;    //single 
    console.log(newFunction(4))


const newFunction2 = (a , b , c , d) => {  //multiple
    let ans = (a * b + c * d);
    return ans;
}
const result = newFunction2(2,3,4,5)
console.log("The total calculation will be : ", result)


// since arrow functions can't have arguements we use spread operator (...anything)




// Hoisting 
// Basically calling a function first before it's being declared

printHello(); 
function printHello() {
    console.log("Hello, world!");
}



// High-order function is a function that:

// Takes another function as an argument (callback function).
// Returns another function as its result.
// Or both.

// Examples of High-Order Functions

const numbers = [1, 2, 3, 4, 5];

const double = (num) => num * 2;

// Using the higher-order function `map` to apply `double` to each element in the array
const doubledNumbers = numbers.map(double);

console.log("Original Numbers:", numbers); 
console.log("Doubled Numbers:", doubledNumbers); 




// Spread Operator
const numbs = [1, 2, 3];
const copy = [...numbs]; // Create a copy
copy.push(4);

console.log("Original:", numbs); 
console.log("Copy:", copy);        

// Arrays can be Merged Using Spread Operator 

const arr1 = [1, 2];
const arr2 = [3, 4];
const merged = [...arr1, ...arr2];

console.log(merged); 



// Objects in JS

let car = {
    brand: "Toyota",
    model: "Corolla",
    year: 2021
};

console.log(car.brand); // Toyota
car.year = 2022; // Update property
console.log(car.year); // 2022
