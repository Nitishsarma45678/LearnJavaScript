
function getAlternates(arr){
    let a = []

    for (i = 0; i < arr.length; i+=2){
        a.push(arr[i]);
    }
    return a;
}

let arr = [10 , 20 , 30 , 40 , 50 , 60]
console.log(getAlternates(arr).join(' '));