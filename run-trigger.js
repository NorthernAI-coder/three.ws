const { execSync } = require('child_process');

try {
  execSync('bash scripts/trigger-bazaar.sh', { stdio: 'inherit' });
} catch (e) {
  console.error(e.message);
}
