function generateDescription(bookmarks) {
    let text = '';

    if (bookmarks.length !== 0) {
    	text += 'Bookmarks:\n';
    	
    	for (let i = 0; i < bookmarks.length; i++) {
	        let b = bookmarks[i];
	        text += `${b.name} — ${b.time}\n`;
	    }

	    text += '\n\n';
    }

    text += 'Written by the Ignition Club\n\nMain project leads:\n    Jonathan Liu and Erik Zhang\nProject Manager:\n    Erik Zhang\nSoftware:\n    Jonathan Liu and Arjun Patrawala\nHardware:\n    Ian Schneider';

    return text;
}

module.exports = { generateDescription };