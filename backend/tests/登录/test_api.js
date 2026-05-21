const { exec } = require('child_process');

console.log('Starting the server...');

// Start the server
const server = exec('npm run dev');

// Wait for the server to start (5 seconds)
console.log('Waiting for server to start...');
setTimeout(() => {
  console.log('Running API tests...');
  
  // Install axios if not already installed
  exec('npm install axios --no-save', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error installing axios: ${error}`);
      server.kill();
      return;
    }
    
    // Run the API tests
    const test = exec('node tests/api_test.js');
    
    test.stdout.on('data', (data) => {
      console.log(data.toString());
    });
    
    test.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    test.on('close', (code) => {
      console.log(`Tests finished with code ${code}`);
      console.log('Shutting down server...');
      server.kill();
    });
  });
}, 5000);

// Handle server output
server.stdout.on('data', (data) => {
  console.log(`Server: ${data.toString()}`);
});

server.stderr.on('data', (data) => {
  console.error(`Server Error: ${data.toString()}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.kill();
  process.exit();
}); 