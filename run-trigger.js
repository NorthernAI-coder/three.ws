const { execSync } = require('child_process');

try {
  execSync('bash trigger-bazaar.sh', { stdio: 'inherit' });
} catch (e) {
  console.error(e.message);
}
