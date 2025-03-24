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
  

  const stack = new DynamicStack();
  
  stack.push(10);
  stack.push(20);
  stack.push(30);
  console.log("Top element:", stack.peek()); 
  stack.print(); 
  
  console.log("Popped element:", stack.pop()); 
  stack.print(); 
  
  console.log("Is stack empty?", stack.isEmpty()); 
  console.log("Stack size:", stack.size());
  
  stack.push(40);
  stack.print(); 
  