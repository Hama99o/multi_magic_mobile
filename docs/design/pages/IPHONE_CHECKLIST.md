# Pages: the iPhone test for the next TestFlight

**What this is:** about 15 minutes on your iPhone, in this order. Each step is
something the Android emulator cannot show (`QA_DEEP.md`, "What only an
iPhone can show"). Everything else was checked on the emulator on 2026-11-07.

**How to report:** for each step, ✅ or ❌. For a ❌, send a screenshot and one
sentence. A step you could not do is "skipped", not ❌.

**Before you start:**
- Have 2 or 3 photos and one long video (1 GB or more if you can) in Photos.
- Have a PDF and a Word file in Files.
- Use a folder you don't mind filling, such as a "Test" folder in any space.

---

## 1 · Share from Photos (the main way in)

This needs the build that has the share extension. The App Group step on
developer.apple.com comes first.

1. In Photos, select **3 photos and 1 video**, then tap **Share**.
   - **First time only:** if "MultiMagic Pages" is not in the row of apps,
     scroll to the end, tap **More**, turn it on, then tap it.
   - ✅ MultiMagic opens on **Save to Pages** with the 4 thumbnails and the
     right total size (the size should match what Photos says).
2. Tap a space, then **Today's folder (YYYY-MM-DD)**, then **Upload 4 files
   to …**.
   - ✅ The upload list shows all 4 and they finish as "Saved in …".
   - ✅ The names are the real ones (IMG_1234.HEIC, IMG_1235.MOV), not
     numbers.
3. Share 1 more photo the same way.
   - ✅ It opens straight in **today's folder** (the last place you used).
   - ✅ "Today's folder" does not make a second folder with the same date.

## 2 · Background upload with the phone locked

1. Upload the **long video**, from Share or from + New → Upload photos or
   videos.
2. As soon as the progress shows, **lock the phone** for 2 minutes, then
   unlock.
   - ✅ It finished, or it is still going and then finishes. It must not say
     "failed".
3. Start another upload and **swipe the app away** (close it), then reopen it.
   - ✅ The upload row says "Checking whether it arrived…" and then "Saved".
     The folder holds **one** copy, not two.

## 3 · The Photos permission ("Limited Access")

1. iPhone **Settings → MultiMagic → Photos → "Limited Access"**, and choose 2
   photos.
2. In Pages: **+ → Upload photos or videos**.
   - ✅ You can pick from those photos, or add more. Nothing crashes and no
     empty screen appears.
3. Set it back to **"Full Access"** afterwards.

## 4 · Documents open inside the app

1. Upload a **PDF** and a **Word (.docx)** file with + → Upload files, then
   tap each.
   - ✅ Each opens **inside the app**, readable, and you can scroll it.
2. On each, tap the download arrow (Share or save) and choose **Save to
   Files**.
   - ✅ The file appears in Files with the right name.

## 5 · Photos: swipe and pinch

1. Open a folder with several photos and tap one.
   - ✅ A dark screen with "1 of N" at the bottom.
2. **Swipe left.**
   - ✅ The next photo; the name at the top changes.
3. **Pinch to zoom**, drag around, then **double-tap**.
   - ✅ It zooms in and out smoothly. The emulator could not test pinch, so
     this is the first real test of it.

## 6 · Fits the screen

On any Pages screen:
- ✅ Nothing hides under the **notch / Dynamic Island** at the top.
- ✅ The **bottom tabs** (Home, Starred, Shared, Files), the **+** and the
  **upload bar** sit above the home bar at the bottom and can all be tapped.
- ✅ In **French** (Profile → Language → Français), no word is cut off on the
  main Pages screens.
- ✅ **Offline band** (Control Centre → airplane mode on, leave MultiMagic and
  come back): one dark line "Offline · it'll all send when you're back" sits
  just **below the Dynamic Island**, and the screen's title and buttons sit
  below it, nothing covered. Airplane mode off, leave and come back: the line
  is gone and Pages fills in by itself, with no Try again tap.

## 7 · Download several files at once (1.1.1)

In a folder with a few photos and a PDF:
- Long-press one, tap the others: the top bar has a **Download** button
  (arrow down), beside star / move / trash.
- Tap it: iOS opens **Files** to choose a folder. Choose one (e.g. "On My
  iPhone → Downloads"). A line says "Downloading 1 of 3…", then a message
  "3 files saved".
- Open the Files app: the three files are there, with their own names, and
  each opens.
- Do it again and tap **Cancel** in Files: nothing happens, no message.
- Select a folder together with a file: the message says the folder was
  skipped.

---

**Already checked on the emulator, no need to repeat:**
- type filters show only files of that type, and Folders only folders;
- sizes match the phone;
- grid view keeps folders and files on separate rows;
- Move opens where the file is;
- Search with its chips;
- Trash, with Restore, Delete forever and Empty trash;
- audio controls;
- Android PDFs.
