class BookmarksManager {
    constructor() {
        this.bookmarks = [];
        this.render();
    }

    render() {
        document.getElementById('bookmarks').innerHTML = this.toHTMLString();
    }

    toHTMLString() {
        let html = '';

        for (let i = 0; i < this.bookmarks.length; i++) {
            let bookmark = this.bookmarks[i];
            html += `
                <div class="each-bookmark">
                    ${bookmark.name} — ${bookmark.time}
                    <button class="edit-btn" onclick="bookmarksManager.edit(${i})">Edit</button>
                    <button class="remove-btn" onclick="bookmarksManager.remove(${i})">X</button>
                </div>
                <br>
            `;
        }

        return html;
    }

    add(time, name) {
        this.bookmarks.push({
            time,
            name: name || 'Untitled bookmark'
        });
        
        this.save();
        this.render();
    }

    save() {
        ipcRenderer.send('set bookmarks',this.booksmarks);
    }

    edit(i = 0) {
        let newName = prompt('What should the name of this bookmark be?', this.bookmarks[i].name);

        if (newName) {
            this.bookmarks[i].name = newName;
        }

        this.save();
        this.render();
    }

    remove(i = 0) {
        this.bookmarks.splice(i, 1);
        this.save();
        this.render();
    }

    clearAll() {
        this.bookmarks = [];
        this.save();
        this.render();
    }

    setBookmarks(bookmarks) {
        this.bookmarks = bookmarks;
        this.render();
    }
}