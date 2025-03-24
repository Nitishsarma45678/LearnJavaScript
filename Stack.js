//Implementation of Stack using Dynamic Sized Array (worse)


class DynamicStack {
    constructor() {
      this.stack = [];
    }
  
    // Push an element onto the stack
    push(element) {
      this.stack.push(element);
    }
  
    // Pop an element from the stack
    pop() {
      if (this.isEmpty()) {
        throw new Error("Stack underflow: Cannot remove element, stack is empty.");
      }
      return this.stack.pop();
    }
  
    // Peek at the top element of the stack
    peek() {
      if (this.isEmpty()) {
        throw new Error("Stack is empty: No element to peek.");
      }
      return this.stack[this.stack.length - 1];
    }
  
    // Check if the stack is empty
    isEmpty() {
      return this.stack.length === 0;
    }
  
    // Get the current size of the stack
    size() {
      return this.stack.length;
    }
  
    // Print the stack elements
    print() {
      console.log("Stack contents:", this.stack.join(" "));
    }
  }
  

  const stack12 = new DynamicStack();
  
  stack12.push(10);
  stack12.push(20);
  stack12.push(30);
  console.log("Top element:", stack12.peek()); 
  stack12.print(); 
  
  console.log("Popped element:", stack12.pop()); 
  stack12.print(); 
  
  console.log("Is stack empty?", stack12.isEmpty()); 
  console.log("Stack size:", stack12.size());
  
  stack12.push(40);
  stack12.print(); 






// Implementation Using a simple class(Better with space and time complexity)

  class Stack {
    constructor() {
      this.items = []; 
    }
  
    // Push element onto the stack
    push(element) {
      this.items.push(element);
    }
  
    // Remove and return the top element from the stack
    pop() {
      if (this.isEmpty()) {
        return "Stack is empty";
      }
      return this.items.pop();
    }
  
    // View the top element without removing it
    peek() {
      if (this.isEmpty()) {
        return "Stack is empty";
      }
      return this.items[this.items.length - 1];
    }
  
    // Check if the stack is empty
    isEmpty() {
      return this.items.length === 0;
    }
  
    // Get the size of the stack
    size() {
      return this.items.length;
    }
  
    // Clear the stack
    clear() {
      this.items = [];
    }
  
    // Print the stack elements
    print() {
      console.log(this.items.join(" "));
    }
  }
  

  const stack = new Stack();
  
  stack.push(10);
  stack.push(20);
  stack.push(30);
  console.log("Top element:", stack.peek()); 
  stack.print(); 
  
  console.log("Popped element:", stack.pop());
  stack.print(); 
  
  console.log("Is stack empty?", stack.isEmpty()); 
  console.log("Stack size:", stack.size()); 
  
  stack.clear();
  console.log("Stack cleared.");
  console.log("Is stack empty?", stack.isEmpty()); 
  