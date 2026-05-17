setTimeout(() => {
  fetch('http://localhost:3000/api/admin/reset-budget')
  .then(res => res.json())
  .then(data => {
    console.log("Success:", data);
    process.exit(0);
  })
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
}, 2000);
