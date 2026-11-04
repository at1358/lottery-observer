const raw=location.hash.slice(1);
const validPages=["dh","zs","cp","gg","xh","sm","tj","tg","xg","tzfh"];
const pageKey=pageKeyRaw.toLowerCase();
const matchedBase = validPages.find(v => pageKey.startsWith(v));
if(!matchedBase)return;
iframe.src = `/payloads/${matchedBase}.html${suffix ? "#" + encodeURIComponent(suffix) : ""}`;
