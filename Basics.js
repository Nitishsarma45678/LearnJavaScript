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

