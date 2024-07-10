cd ${TESTSOLAR_WORKSPACE}

ls -la

if [ -f "package.json" ]; then
  echo "package.json found, running pnpm install..."
  pnpm install
else
  echo "package.json not found, skipping pnpm install."
fi
