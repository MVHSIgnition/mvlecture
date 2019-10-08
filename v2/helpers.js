function generateDescription(bookmarks) {
    let text = 'Bookmarks:\n';

    for (let i = 0; i < bookmarks.length; i++) {
        let bookmark = bookmarks[i];
        text += `${bookmark.name} — ${bookmark.time}\n`;
    }

    text += '\nWritten by the MVHS Ignition Club\n\nMain project leads:\n    Jonathan Liu and Erik Zhang\nProject Manager:\n    Erik Zhang\nSoftware backend:\n    Jonathan Liu\nUser interface + bookmarks:\n    Arjun Patrawala\nHardware:\n    Ian Schneider';

    return text;
}

module.exports = { generateDescription };