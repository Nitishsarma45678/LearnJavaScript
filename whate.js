
let arr = [2, 3, -1, -4, 6];
let max = arr[0];

for (i = 0 ; i < arr.length; i++){
    if (arr[i] > max){
        max = arr[i]
    }
}

console.log(max)