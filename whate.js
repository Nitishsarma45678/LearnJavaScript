
let arr = [2, 3, -1, -4, 6];
let max = arr[0];

for (i = 0 ; i < arr.length; i++){
    if (arr[i] > max){
        max = arr[i]
    }
}

console.log(max)




const character = "#";
const count = 8;
const rows = [];

for (let i = 0; i < count; i++) {
  rows.push(i);
}

let result = ""


for (const row of rows) {
    result = result + row + "\n"
}

console.log(result);