let stringArray = ["1", "2", "3", "4", "5"];

function sumString(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += parseInt(arr[i]);
    }
    return sum;
}

console.log(sumString(stringArray));