let stringArray = ["1", "2", "3", "4", "5"];

function sumString(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += parseInt(arr[i]);
    }
    return sum;
}

console.log(sumString(stringArray));




//Create using new Keyword (Constructor)

let a = new Array(10 , 20 , 30)

console.log(a)



//Modifying the Array Elements

let arr = [2 , 3 , 7 , 9]
console.log(arr)

arr[0] = 67
console.log(arr)



// .push() adds an element to the end of an array 

let array = ["Sherlock" , "John" , 8 , "Hudson"];
array.push("Greg");
console.log(array);


Object

let object = 
{
    Name : 'king',
    Roll : '5439',
    State : 'Arunachal'
}

console.log(object)




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