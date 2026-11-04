const raw=location.hash.slice(1);
const validPages=["dh","xg"];
const pageKey=pageKeyRaw.toLowerCase();
if(!validPages.includes(pageKey))return;
iframe.src = `/seryuq/${pageKey}.html${suffix ? "#" + encodeURIComponent(suffix) : ""}`;
