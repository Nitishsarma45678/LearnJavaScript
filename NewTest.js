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


//.unshift()  adds an element to the beginning of the array


let neja = ["Sherlock" , "John" , 8 , "Hudson"];

neja.unshift("Greg");
console.log(neja);



//.splice() removes elements using index value
let what = ["Sherlock" , "John" , 8 , "Hudson"];

what.splice(2,3);
console.log(what);


// Increase and Decrease the Array Length

let kajArray = [2,4,5,3,1];
kajArray.length = 10;           //increase by 10 

console.log(kajArray);


let rjaArray = [2,4,5,3,1];
rjaArray.length = 2;                // Decreases by 2

console.log(rjaArray);


// .concat()   combines two arrays together 

let ak = ["2" , "3" , "4"];
let bk = ["raj" , "kaj", 54];

// let combined = ak.concat(bk);

// console.log(combined);




//.toString()   conversion of an Array to String 

let dk = [3 , 4, 5, 6 , 9]

console.log(dk.toString());

console.log(typeof(dk));  // typeof()   used to check the type of an Array , returns Object.




let testArray = [1,2,3,1]

let s = new Set(testArray)

if( s.size != testArray.length){
    console.log(true);
}
else{
    console.log(false);
}




function isSame(g,t){
    if (g.length != t.length){
        return false;
    }
    return g.split('').sort().join('') === t.split('').sort().join('');

}

let g = "anagram"
let t = "nagaram"

console.log(isSame(s,t));