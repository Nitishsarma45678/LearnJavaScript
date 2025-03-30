// Given the existing code below, write some code to switch the values of the variables a and b.


// function test() {
//     var a = "3";
//     var b = "8";
    
// /***********Do not change the code above 👆*******/


// /***********Do not change the code below 👇*******/

//     console.log("a is " + a);
//     console.log("b is " + b);
// }


// Do NOT change any of the existing code.

// You are NOT allowed to type any numbers.

// You should NOT redeclare the variables a and b.

// Use exactly 3 lines of code to solve the problem.

// Output:
// When the code is run, it should output:

// a is 8  
// b is 3  

function test() {
    var a = "3";
    var b = "8";
    
/***********Do not change the code above 👆*******/

    var temp = a;  //here I have created a third variable(temp) which will store the a value for temporary use.
    a = b;
    b = temp;

/***********Do not change the code below 👇*******/

    console.log("a is " + a);
    console.log("b is " + b);
}









//BMI Calculator Advanced (IF/ELSE)
// Previously, we've created a function that is able to calculate the BMI. But once we get a result, we will want to tell the user what the number means.

// Write a function that outputs (returns) a different message depending on the BMI.



// BMI <18.5, the output should be: "Your BMI is <bmi>, so you are underweight."

// BMI 18.5-24.9, the output should be "Your BMI is <bmi>, so you have a normal weight."

// BMI >24.9, the output should be "Your BMI is <bmi>, so you are overweight."



// The message MUST be returned as an output from your function. You should NOT NEED to use alert, prompt or console.log in this challenge.

// IMPORTANT the message wording has to match precisely for the code to pass the validation. Including punctuation and capitalisation.



function bmiCalculator(weight, height) {
    let result = weight / (height * height);

    if (result < 18.5) {
        return `Your BMI is ${result}, so you are underweight.`;
    } else if (result >= 18.5 && result <= 24.9) {
        return `Your BMI is ${result}, so you have a normal weight.`;
    } else {
        return `Your BMI is ${result}, so you are overweight.`;
    }
}
