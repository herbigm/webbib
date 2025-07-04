let bibEntries = [];
let selectedEntries = [];
let entryTypes = {};
let fields = {};
let displayStyle = {};
let displayFilters = [];
let bibFile = "";
let accessKey = "";
let readonly = false;

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function INIT() {
    fetch("types.json")
        .then((res) => res.json())
        .then((data) => {
            entryTypes = data;
        })
        .catch((e) => console.error(e));
    fetch("fields.json")
        .then((res) => res.json())
        .then((data) => {
            fields = data;
        })
        .catch((e) => console.error(e));
    fetch("displayStyles/default.json")
        .then((res) => res.json())
        .then((data) => {
            displayStyle = data;
        })
        .catch((e) => console.error(e));

    const searchParams = new URLSearchParams(document.location.search);
    if (searchParams.get("file")) {
        bibFile = searchParams.get("file");
        if (document.location.hash != "") {
            accessKey = document.location.hash.substring(1);
            readonly = false;
        }
        loadFromServer();
    } else {
        let currentLocation = window.location;
        let baselink = "http://" + currentLocation.host + currentLocation.pathname;

        if (localStorage.getItem("bibFile")){
            bibFile = localStorage.getItem("bibFile");
            document.getElementById("ropermalink").href = baselink + "?file=" + bibFile;
        }

        if (localStorage.getItem("accessKey")){
            accessKey = localStorage.getItem("accessKey");
            document.getElementById("rwpermalink").href = baselink + "?file=" + bibFile + "#" + accessKey;
            readonly = false;
        }

        if (localStorage.getItem("bibEntries")){
            bibEntries = JSON.parse(localStorage.getItem("bibEntries"));
            setTimeout(createTags, 500);
            setTimeout(showEntrys, 500);
        }
    }
    if (!readonly) {
        document.getElementById("saveOnServer").style.display = "inline";
    } else {
        document.getElementById("saveOnServer").style.display = "none";
    }
}

async function loadBIB(fileSelector) {
    const doc = await fileSelector.files[0].text();

    bibEntries = interpretBibTeX(doc)

    createTags();
    resortEntrys();

    localStorage.setItem("bibEntries", JSON.stringify(bibEntries));
}

function interpretBibTeX(bibtex) {
    let entryList = [];
    const regexEntry = /@(\w+)\{([\w\-_:]+)/gui;
    const regexLine = /\s*(\w+)\s*=\s*[{"](.*?)[}"],/gui;
    let start = -1;
    let end = -1;

    for (m of bibtex.matchAll(regexEntry)) {
        if (m[1].toLowerCase() == "comment")
            continue;
        let entry = {};
        entry['entryType'] = m[1].toLowerCase();
        entry['key'] = m[2];
        if (m.index < end)
            continue;
        start = m.index;
        let pos = start + 3 + m[1].length + m[2].length;
        let escaped = false;
        let bracecount = 1;
        while (bracecount > 0 && pos < bibtex.length) {
            pos++;
            if (!escaped) {
                if (bibtex[pos] == '}') {
                    bracecount--;
                    if (bracecount == 0) {
                        end = pos;
                    }
                } else if (bibtex[pos] == '{') {
                    bracecount++;
                }
            }
            if (bibtex[pos] == '\\' && escaped == false)
                escaped = true;
            else
                escaped = false;
        }
        const lines = bibtex.substring(start, end);
        for (line of lines.matchAll(regexLine)) {
            let field = line[1].toLowerCase();
            line[2] = replaceLaTeX(line[2]);
            if (field in fields) {
                if (fields[field]['type'].startsWith("ListOf")) {
                    entry[field] = line[2].split(" and ");
                    if (field == "author") {
                        for (i = 0; i < entry[field].length; i++) {
                            if (entry[field][i].includes(",")) {
                                let parts = entry[field][i].split(/\s*,\s*/gui);
                                entry[field][i] = parts[1] + " " + parts[0];
                            }
                        }
                    }
                } else {
                    entry[field] = line[2];
                }
            } else {
                entry[field] = line[2];
            }
        }

        if (!("date" in entry)) {
            entry['date'] = "";
        }
        if ("journal" in entry) {
            entry['journaltitle'] = entry['journal'];
            delete entry['journal'];
        }
        if (entry['date'] == "") {
            if (('year' in entry) && ('month' in entry) && ("day" in entry)) {
                const monthNumber = months.indexOf(entry['month']) + 1;
                if (monthNumber < 10) {
                    entry['date'] = entry['year'] + "-0" + monthNumber + "-" + entry['day'];
                } else {
                    entry['date'] = entry['year'] + "-" + monthNumber + "-" + entry['day'];
                }
                delete entry['year'];
                delete entry['month'];
                delete entry['day'];
            }
            else if (('year' in entry) && ('month' in entry)) {
                const monthNumber = months.indexOf(entry['month']) + 1;
                if (monthNumber < 10) {
                    entry['date'] = entry['year'] + "-0" + monthNumber;
                } else {
                    entry['date'] = entry['year'] + "-" + monthNumber;
                }
                delete entry['year'];
                delete entry['month'];
            } else if ('year' in entry) {
                entry['date'] = entry['year'];
                delete entry['year'];
            } else {
                entry['date'] = "unknown date";
            }
        }

        if ("groups" in entry) {
            if (!Array.isArray(entry['groups'])) {
                entry['groups'] = entry['groups'].split(/\s*,\s*/gi);
            }
            for (let i = 0; i < entry['groups'].length; i++) {
                entry['groups'][i] = entry['groups'][i].replace(/\s+/gi, "_")
            }
        }

        if (!(m[2] in entryList))
            entryList.push(entry);
    }
    return entryList;
}

function showEntrys(entries, showSelected) {
    if (!entries)
        entries = bibEntries;
    let selectedByURI = [];
    if (!showSelected) {
        showSelected = false;
    } else {
        const searchParams = new URLSearchParams(document.location.search);
        if (searchParams.get("entry")) {
            selectedByURI = searchParams.get("entry").split(",");
        }
    }
    const list = document.querySelector("#referenceList");
    list.innerHTML = "";
    for (let i = 0; i < entries.length; i++) {
        let entry = entries[i];
        let content = "";
        if (entry['entryType'] in displayStyle) {
            let type = entryTypes[entry['entryType']];
            content = displayStyle[entry['entryType']];
            const matches = content.matchAll(/<(\w+)>(.*)<\/\1>/gui);

            for (let match of matches) {
                if (type['required'].indexOf(match[1]) !== -1) {
                    // field is required
                    if (match[1] in entry) {
                        if (entry[match[1]] == "") {
                            content = content.replace(match[0], match[2].replace("#", match[1] +  " not given"));
                        } else {
                            if (Array.isArray(entry[match[1]])) {
                                let s = /#\[maxnames=(\d+)\]/gui;
                                let match2 = s.exec(match[2]);
                                let names = entry[match[1]];
                                if (match2 != null) {
                                    let maxCount = parseInt(match2[1]);
                                    if (entry[match[1]].length > maxCount) {
                                        names.splice(maxCount);
                                        names.push(" et al.");
                                    }
                                    match[2] = match[2].replace(match2[0], "#");
                                }
                                content = content.replace(match[0], match[2].replace("#", names.join(", ")));
                            } else {
                                content = content.replace(match[0], match[2].replace("#", entry[match[1]]));
                            }
                        }
                    } else {
                        content = content.replace(match[0], match[2].replace("#", match[1] +  " not given"));
                    }
                } else {
                    // optional entry
                    if (match[1] in entry) {
                        if (entry[match[1]] != "") {
                            content = content.replace(match[0], match[2].replace("#", entry[match[1]]));
                            continue;
                        }
                    }
                    content = content.replace(match[0], "");
                }
            }
        } else {
            content = entry['author'] + "<span style=\"color: red;\">" + entry['entryType'] + "</span>";
        }

        let listEntry = document.createElement("div");
        listEntry.classList.add("referenceEntry");
        listEntry.setAttribute("id", entry['key']);
        if (selectedByURI.includes(entry['key'])) {
            selectedEntries.push(entry);
        }

        let citing = document.createElement("div");
        citing.innerHTML = content;
        citing.classList.add("citing");
        citing.onclick = function() {
            toggleSelected(entry['key']);
        };
        listEntry.appendChild(citing);

        let options = document.createElement("div");
        options.classList.add("entryOptions");
        listEntry.appendChild(options);

        const downloadlink = document.createElement("a");
        downloadlink.classList.add("downloadlink");
        downloadlink.classList.add("fas");
        downloadlink.classList.add("fa-download");
        downloadlink.setAttribute("title", "download entry");
        downloadlink.onclick = function() {
            downloadBibLaTeX([entry]);
        }
        options.appendChild(downloadlink);

        if (entry['doi']) {
            const doiLink = document.createElement("a");
            doiLink.classList.add("downloadlink");
            doiLink.classList.add("fas");
            doiLink.classList.add("fa-file-pdf");
            doiLink.setAttribute("title", "got to doi");
            doiLink.setAttribute("target", "_blank");
            doiLink.href = "https://doi.org/" + entry['doi'];
            options.appendChild(doiLink);
        }

        if (entry['url']) {
            const urlLink = document.createElement("a");
            urlLink.classList.add("downloadlink");
            urlLink.classList.add("fas");
            urlLink.classList.add("fa-file-pdf");
            urlLink.setAttribute("title", "got to doi");
            urlLink.setAttribute("target", "_blank");
            urlLink.href = entry['url'];
            options.appendChild(urlLink);
        }

        if (!readonly){
            const editLink = document.createElement("a");
            editLink.classList.add("downloadlink");
            editLink.classList.add("fas");
            editLink.classList.add("fa-edit");
            editLink.setAttribute("title", "edit entry");
            editLink.onclick = function() {
                manageEntry(entry);
            }
            options.appendChild(editLink);
        }

        const marklink = document.createElement("a");
        marklink.classList.add("downloadlink");
        marklink.classList.add("fas");
        marklink.classList.add("fa-copy");
        marklink.setAttribute("title", "copy link to this entry");
        marklink.onclick = function() {
            let location = window.location.href.replace(window.location.hash, "").replace(window.location.search, "");
            const search = new URLSearchParams(document.location.search);
        location += "?file=" + search.get("file") + "&entry=" + entry['key'];
            navigator.clipboard.writeText(location).then(function() {
                popup.innerText = "link copied";
                popup.style.display = 'block'; // show Popup

                setTimeout(function() {
                    popup.style.display = 'none'; // hide popup after 2 seconds
                }, 2000); // 2000 millis = 2 Sekunden
            }, function(err) {
                console.error('Async: Could not copy text: ', err);
            });
        }
        options.appendChild(marklink);

        list.appendChild(listEntry);
    }

    for (let e of selectedEntries) {
        const citation = document.querySelector("#" + e['key']);
        if (citation)
            citation.classList.add("selectedEntry");
    }

    if (selectedByURI.length > 0) {
        document.querySelector("#" + selectedByURI[0]).scrollIntoView({ behavior: "smooth", block: "center"});
    }

    console.log(entries);
}

/////////////////////////////////////////////////////////////////////////////////////////
// Sorting
/////////////////////////////////////////////////////////////////////////////////////////

function sortBy(key) {
    const order = document.querySelector("#sortOrder").value;
    bibEntries.sort((a,b) => {
        if (!(key in a))
            return 1 * order;
        if (!(key in b))
            return -1 * order;

        if (Array.isArray(a[key]))
            return a[key][0].localeCompare(b[key][0]) * order;
        return a[key].localeCompare(b[key]) * order;
    });
}

function resortEntrys() {
    let key = document.querySelector("#sortKey").value;
    sortBy(key);
    let haystack = useTag(document.querySelector("#tagSelect").value, bibEntries);
    showEntrys(search(document.querySelector("#filterInput").value, haystack));
}

/////////////////////////////////////////////////////////////////////////////////////////
// Search
/////////////////////////////////////////////////////////////////////////////////////////
function searchFor(evt) {
    const needle = evt.target.value;

    if (needle.startsWith("key::")) {
        for (let i = 0; i < bibEntries.length; i++) {
            if (bibEntries[i]['key'] == needle.substring(5)) {
                showEntrys([bibEntries[i]]);
                return;
            }
        }
    }

    const haystack = useTag(document.querySelector("#tagSelect").value, bibEntries);
    showEntrys(search(needle, haystack));
}

function search(needle, haystack) {
    let results = [];

    if (!haystack) {
        haystack = bibEntries;
    }

    if (needle == "")
        return haystack;

    if (needle.startsWith("key::")) {
        for (let i = 0; i < haystack.length; i++) {
            if (haystack[i]['key'] == needle.substring(5))
                return [haystack[i]];
        }
    }

    needle = needle.toLowerCase();

    for (let i = 0; i < haystack.length; i++) {
        for (key in haystack[i]) {
            if (JSON.stringify(haystack[i][key]).toLowerCase().indexOf(needle) > -1) {
                results.push(haystack[i]);
                break;
            }
        }
    }

    return results;
}

/////////////////////////////////////////////////////////////////////////////////////////
// Tags
/////////////////////////////////////////////////////////////////////////////////////////
function createTags() {
    const tagSelect = document.querySelector("#tagSelect");
    tagSelect.innerHTML = "";
    let option = document.createElement("option");
    option.value = "";
    option.innerText = "all tags";
    tagSelect.appendChild(option);
    let tags = [];
    for (const entry of bibEntries) {
        if ("groups" in entry) {
            for (const g of entry['groups']) {
                tags.push(g);
            }
        }
    }
    let unique = [...new Set(tags)];
    for (const g of unique) {
        option = document.createElement("option");
        option.value = g;
        option.innerText = g;
        tagSelect.appendChild(option);
    }
}

function applyTag(evt) {
    const needle = evt.target.value;
    const haystack = search(document.querySelector("#filterInput").value, bibEntries);
    showEntrys(useTag(needle, haystack));
}

function useTag(needle, haystack) {
    let results = [];

    if (needle == "")
        return haystack;

    if (!haystack) {
        haystack = bibEntries;
    }

    for (let i = 0; i < haystack.length; i++) {
        if ("groups" in haystack[i]) {
            if (haystack[i]['groups'].indexOf(needle) !== -1) {
                results.push(haystack[i]);
            }
        }
    }

    return results;
}


/////////////////////////////////////////////////////////////////////////////////////////
// Selection
/////////////////////////////////////////////////////////////////////////////////////////

function toggleSelected(key) {
    // test if selected
    let selected = false;
    for (let e = 0; e < selectedEntries.length; e++) {
        if (selectedEntries[e]['key'] == key) {
            selected = true;
            selectedEntries.splice(e, 1);
            break;
        }
    }

    if (!selected) {
        for (let e of bibEntries) {
            if (e['key'] == key) {
                selectedEntries.push(JSON.parse(JSON.stringify(e)));
                break;
            }
        }
    }

    let haystack = search(document.querySelector("#filterInput").value, bibEntries);
    if (document.querySelector("#tagSelect").value != "")
        haystack = useTag(document.querySelector("#tagSelect").value, haystack);
    showEntrys(haystack);
}


/////////////////////////////////////////////////////////////////////////////////////////
// Editing
/////////////////////////////////////////////////////////////////////////////////////////

function manageEntry(e = null) {
    let tmpEntry;

    // Wenn ein Eintrag übergeben wird, bearbeiten wir ihn, andernfalls erstellen wir einen neuen
    if (e) {
        tmpEntry = JSON.parse(JSON.stringify(e));
        document.querySelector('#modalHeader h1').innerText = "Edit Entry";
    } else {
        const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const chars = alphabet.split('');
        let key = "";
        do {
            key = "";
            for (let i = 0; i < 16; i++) {
                const randomIndex = Math.floor(Math.random() * chars.length);
                key += chars[randomIndex];
            }
        } while (key in bibEntries);
        tmpEntry = {"entryType": "article", "key": key}; // neuer Eintrag
        document.querySelector('#modalHeader h1').innerText = "New Entry";
    }

    document.getElementById('modal').classList.remove("invisible");
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = "";

    // modalFooter
    const modalFooter = document.getElementById('modalFooter');
    modalFooter.innerHTML = "";

    // Erstelle Tabelle für das Formular
    let tbl = document.createElement("table");
    tbl.setAttribute("id", "editEntryTable");
    modalBody.appendChild(tbl);

    // Erstelle Auswahl für den Eintragstyp
    let tr = document.createElement("tr");
    tbl.appendChild(tr);
    let td1 = document.createElement("td");
    td1.innerText = "Entry type: ";
    tr.appendChild(td1);

    let td2 = document.createElement("td");
    tr.appendChild(td2);
    let input = document.createElement("select");
    td2.appendChild(input);
    input.classList.add("formInput");
    input.setAttribute("name", "entryType");
    for (const t in entryTypes) {
        let opt = document.createElement("option");
        opt.value = t;
        opt.innerText = t;
        input.appendChild(opt);
    }

    createForm(tmpEntry['entryType'], tbl, tmpEntry);
    input.onchange = function() {
        tmpEntry['entryType'] = input.value;
        createForm(input.value, tbl, tmpEntry);
    };

    let btn = document.createElement("button");
    btn.innerText = "save";
    btn.onclick = function() {
        for (const required of entryTypes[tmpEntry['entryType']]['required']) {
            if (fields[required]['type'] == "literal" || fields[required]['type'] == "verbatim" || fields[required]['type'] == "date" || fields[required]['type'] == "Range") {
                if (tmpEntry[required] == "" || !(tmpEntry[required])) {
                    alert("Missing required information: " + required);
                    return;
                }
            } else if (fields[required]['type'].startsWith("ListOf")) {
                if (tmpEntry[required].length < 1 || !(tmpEntry[required])) {
                    alert("Missing required information: " + required);
                    return;
                }
            }
        }

        if (e) {
            // Aktualisiere den bestehenden Eintrag
            bibEntries[bibEntries.indexOf(e)] = tmpEntry;
        } else {
            // Füge den neuen Eintrag hinzu
            bibEntries.push(tmpEntry);
        }

        createTags();
        resortEntrys();

        localStorage.setItem("bibEntries", JSON.stringify(bibEntries));
        document.getElementById('modal').classList.toggle("invisible");
    };

    modalFooter.appendChild(btn);
}


function createForm(t, tbl, e) {
    // t: Type of entry
    while (tbl.children.length > 1) {
        tbl.removeChild(tbl.lastChild);
    }

    // include required fields
    for (const required of entryTypes[t]['required']) {
        createFormRow(tbl, e, required, "*");
    }
    for (const optional of entryTypes[t]['optional']) {
        createFormRow(tbl, e, optional, "");
    }
}

function createList(hiddenInput, listElement) {
    let list = [];
    if (hiddenInput.value != "" && hiddenInput.value != "undefined") {
        list = JSON.parse(hiddenInput.value);
    }
    listElement.innerHTML = "";
    for (const n of list) {
        let li = document.createElement("li");
        li.innerText = n;
        listElement.appendChild(li);

        let del = document.createElement("a");
        li.appendChild(del);
        del.classList.add("fas");
        del.classList.add("fa-trash");
        del.onclick = function() {
            list = list.filter(name => name !== n);
            hiddenInput.value = JSON.stringify(list);
            createList(hiddenInput, listElement);
        };
    }
}

function createFormRow(table, e, field,  suffix) {
    let tr = document.createElement("tr");
    table.appendChild(tr);
    let td1 = document.createElement("td");
    td1.innerText = field + suffix;
    tr.appendChild(td1);
    if (fields[field]['type'] == "literal" || fields[field]['type'] == "verbatim" || fields[field]['type'] == "date" || fields[field]['type'] == "Range") {
        let td2 = document.createElement("td");
        tr.appendChild(td2);

        let input = document.createElement("input");
        td2.appendChild(input);
        input.classList.add("formInput");
        input.setAttribute("type", "text");
        input.setAttribute("name", field);
        input.setAttribute("data-type", fields[field]['type']);
        if (e[field])
            input.value = e[field];
        input.onchange = function() {
            e[field] = input.value;
        };
        if (field == "doi") {
            let btn = document.createElement("button");
            td2.appendChild(btn);
            btn.innerText = "…";
            btn.onclick = async function() {
                const res = await getFromDoi(input.value);
                const newEntry = res[0];
                if (!newEntry) {
                    alert("Could not get any data from the doi, sorry!");
                    return;
                }
                if (newEntry['entryType'] != e['entryType']) {
                    document.querySelector('[name="entryType"]').value = newEntry['entryType'];
                    createForm(newEntry['entryType'], table, e);
                }
                for (f in newEntry) {
                    if (f == "entryType" || f == "key")
                        continue;
                    if (fields[f]['type'] == "literal" || fields[f]['type'] == "verbatim" || fields[f]['type'] == "date" || fields[f]['type'] == "Range") {
                        if (e[f] && e[f] != "" && e[f] != newEntry[f]) {
                            if (!confirm("Update information for " + f + " from " + e[f] + " (current entry) to " + newEntry[f] + " (doi based)?"))
                                continue;
                        }
                        e[f] = newEntry[f];
                        document.querySelector('[name="'+f+'"]').value = newEntry[f];
                    } else if (fields[f]['type'].startsWith("ListOf")) {
                        if (e[f] && e[f].length > 0 && JSON.stringify(e[f]) != JSON.stringify(newEntry[f])) {
                            if (!confirm("Update information for " + f + " from " + JSON.stringify(e[f]) + " (current entry) to " + JSON.stringify(newEntry[f]) + " (doi based)?"))
                                continue;
                        }
                        e[f] = newEntry[f];
                        const hidden = document.querySelector('[name="'+f+'"]');
                        if (!hidden)
                            continue;
                        hidden.value = JSON.stringify(newEntry[f]);
                        createList(document.querySelector('[name="'+f+'"]'), document.getElementById("list-"+f));
                    }
                }
            };
        }
    } else if (fields[field]['type'].startsWith("ListOf")) {
        let td2 = document.createElement("td");
        tr.appendChild(td2);

        let inputEdit = document.createElement("input");
        td2.appendChild(inputEdit);
        inputEdit.classList.add("formInput");
        inputEdit.setAttribute("type", "text");
        inputEdit.setAttribute("name", "edit-" + field);

        let inputHidden = document.createElement("input");
        td2.appendChild(inputHidden);
        inputHidden.setAttribute("type", "hidden");
        inputHidden.setAttribute("name", field);
        inputHidden.setAttribute("data-type", fields[field]['type']);
        if (e[field]) {
            inputHidden.value = JSON.stringify(e[field]);
        } else {
            inputHidden.value = "[]";
        }

        let btn = document.createElement("button");
        td2.appendChild(btn);

        td2.appendChild(document.createElement("br"));

        let listElement = document.createElement("ul");
        listElement.setAttribute("id", "list-" + field);
        td2.appendChild(listElement);

        btn.innerText = "+";
        btn.onclick = function() {
            if (inputEdit.value.trim() == "")
                return;
            let list = JSON.parse(inputHidden.value);
            list.push(inputEdit.value);
            inputHidden.value = JSON.stringify(list);
            e[field] = list;
            inputEdit.value = "";
            inputEdit.focus();

            createList(inputHidden, listElement);
        };

        createList(inputHidden, listElement);
    }
}


/////////////////////////////////////////////////////////////////////////////////////////
// Export BibLaTeX
/////////////////////////////////////////////////////////////////////////////////////////

function createBibLaTeX(references) {
    if (!references)
        references = bibEntries;
    let contentEntrys = [];
    for (const entry of references) {
        let content = "@" + entry['entryType'] + "{" + entry['key'] + ",\n";
        for (const key in entry) {
            if (key != 'entryType' && key != 'key' && key != 'file') {
                if (Array.isArray(entry[key])) {
                    content += "    " + key + " = {" + entry[key].join(" and ") + "},\n";
                } else {
                    content += "    " + key + " = {" + entry[key] + "},\n";
                }
            }
        }
        content += "}";
        contentEntrys.push(content);
    }

    return contentEntrys.join("\n\n");
}

function downloadBibLaTeX(references) {
    if (!references)
        references = bibEntries;

    const bibLaTeX = createBibLaTeX(references);
    let blob = new Blob([bibLaTeX], {type: 'text/plain'});

    let link = document.createElement("a");
    link.download = 'references.bib';
    link.href = URL.createObjectURL(blob);

    link.click();
}

function downloadCurrentBibLaTeX() {
    let haystack = useTag(document.querySelector("#tagSelect").value, bibEntries);
    downloadBibLaTeX(search(document.querySelector("#filterInput").value, haystack));
}

/////////////////////////////////////////////////////////////////////////////////////////
// Save on Server / Load from Server
/////////////////////////////////////////////////////////////////////////////////////////

function saveOnServer() {
    let formData = new FormData();
    formData.append("saveTo", bibFile);
    formData.append("accessKey", accessKey);
    formData.append("data", JSON.stringify(bibEntries));
    
    fetch('serverFunctions.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        const popup = document.getElementById('popup');
        popup.innerText = data['message'];
        popup.style.display = 'block'; // show Popup

        setTimeout(function() {
            popup.style.display = 'none'; // hide popup after 2 seconds
        }, 2000); // 2000 millis = 2 Sekunden
        bibFile = data['data'][0];
        accessKey = data['data'][1];
        localStorage.setItem("bibFile", data['data'][0]);
        localStorage.setItem("accessKey", data['data'][1]);
        let currentLocation = window.location;
        let baselink = "http://" + currentLocation.host + currentLocation.pathname;
        document.getElementById("ropermalink").href = baselink + "?file=" + data['data'][0];
        document.getElementById("rwpermalink").href = baselink + "?file=" + data['data'][0] + "#" + data['data'][1];
    })
    .catch((error) => {
        console.error('Fehler:', error);
    });
}

function loadFromServer() {
    let formData = new FormData();
    formData.append("loadFrom", bibFile);
    formData.append("accessKey", accessKey);

    fetch('serverFunctions.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        const popup = document.getElementById('popup');
        popup.innerText = data['message'];
        popup.style.display = 'block'; // show Popup

        setTimeout(function() {
            popup.style.display = 'none'; // hide popup after 2 seconds
        }, 2000); // 2000 millis = 2 Sekunden

        bibEntries = data['payload'];
        setTimeout(createTags(), 500);
        setTimeout(function() {
            showEntrys(null, true);
            const searchParams = new URLSearchParams(document.location.search);
            if (searchParams.get("tag")) {
                document.querySelector("#tagSelect").value = searchParams.get("tag");
                const haystack = search(document.querySelector("#filterInput").value, bibEntries);
                showEntrys(useTag(searchParams.get("tag"), haystack));
            }
        }, 500);

        accessKey = data['data'][1]; // if the access key is not correct it have to be cleared!
        localStorage.setItem("accessKey", data['data'][1]);

        let currentLocation = window.location;
        let baselink = "http://" + currentLocation.host + currentLocation.pathname;
        document.getElementById("ropermalink").href = baselink + "?file=" + bibFile;
        if (accessKey != "") {
            document.getElementById("rwpermalink").style.display = "inline";
            document.querySelector("nav").style.display = "block";
            document.getElementById("rwpermalink").href = baselink + "?file=" + bibFile + "#" + accessKey;
            readonly = false;
        } else {
            document.getElementById("rwpermalink").style.display = "none";
            document.querySelector("header nav").style.display = "none";
        }
    })
    .catch((error) => {
        console.error('Fehler:', error);
    });
}

/////////////////////////////////////////////////////////////////////////////////////////
// DOI support
/////////////////////////////////////////////////////////////////////////////////////////

async function getFromDoi(doi) {
    let res = await fetch("https://api.crossref.org/works/" + doi + "/transform/application/x-bibtex");
    const bibtex = await res.text();

    return interpretBibTeX(bibtex.trim());
}


INIT();
