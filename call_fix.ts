const fetchStr = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/admin/fix-trades');
        const json = await res.json();
        console.log('Result:', json);
    } catch(e) { console.error(e.message); }
}
fetchStr();
