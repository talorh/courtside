# 13. Photos

*Courtside Documentation › How it works. [Contents](README.md).*

> **A photo's path.** The phone makes the photo smaller and drops where it was taken, the Worker checks it's a JPEG and strips any metadata left, Images keeps it privately, and members see it through signed links that last six hours. Nothing about where a photo was taken ever leaves the phone, and no picture is reachable without signing in.

- **Adding:** anyone on the team chooses photos, or on a computer drops them on Add photos. Each is read on the phone or computer for when it was taken (EXIF DateTimeOriginal, from the start of the file), then redrawn at most 2560 px along its longer side as a JPEG (quality 0.88), which turns it upright and leaves off everything else the camera saved, where it was taken included. They're drawn one at a time, as a phone has room to draw only so many, and sent after the first goes alone, so a refusal that would stop them all (signed out, say) stops at the first. Then three at once if the first was in within 5 seconds, or else one at a time, and one at a time for the rest after any dropped connection: on a weak signal three at once share it, and none may be in before it drops. A dropped connection is waited out and tried again; one the site turns down is listed and the rest carry on. A page left before they're all sent says how many weren't, the next time Photos is opened on that phone (kept in its browser for a day).
- **In the Worker:** 10 MB at most, checked as a whole JPEG with any metadata left taken out. Its row is saved first, out of sight, so the photo has its number; then Images keeps it privately, named as it downloads (`saints-b12-1--photo-.jpg`), and the row is filled in. A photo with no date, or one still to come, gets the time it was added.
- **Looking:** newest taken first under each day, 60 a page, through signed links that last six hours. A photo's page has Newer and Older (on a phone a swipe slides between photos in place, the neighbours' pictures already on the page: public/photo-swipe.js) and Download photo.
- **Several at once:** Select photos ticks them, then Download sends them as one zip (stored, written a photo at a time so a page of 60 is never in memory at once), or on an iPhone opens the share menu with them all; Delete deletes them together, all or none, offered only when every one is the member's own (or for a team manager).
- **Deleting:** whoever added a photo, or a team manager, deletes it, Images first; anyone else asks for it to be removed.
- **Every download is logged** with who took it, a photo's alone or each one in a zip, and kept two years.
- **Saving on an iPhone** goes through the share menu, so photos and clips land in Photos rather than Files.

Everything a team keeps (videos, clips and photos) is deleted with the team at the end of 31 December of the year its season ends, `delete_after` on each row.
