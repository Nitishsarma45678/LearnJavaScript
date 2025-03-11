//Find two numbers in a sorted array that add up to a specific target.

function twoSumArray(arr , target){
    let left = 0;
    let right = arr.length - 1

    while(left < right ){
        const sum = arr[left] + arr[right];

        if(sum === target){
            return [left , right]
        }
        else if(sum < target){
            left ++
        }
        else{
            right --
        }
    }
    return[]
}

let array = [2, 3, 4, 5, 6, 7, 8]
let target = 9 ;

console.log(twoSumArray(array , target));