; Afterglow quick menu for games
;
; Press Caps Lock + Tab to pop up a mini player over your game.
; Works in borderless and windowed games. Games set to exclusive
; "Fullscreen" draw over everything, so switch those to "Borderless".
;
; Needs AutoHotkey v2 (free): https://www.autohotkey.com
; Afterglow must be open, ideally installed as an app so it has its own window.
;
; While the menu is open:
;   Space        play / pause
;   Left or A    previous song
;   Right or D   next song
;   Up or W      volume up
;   Down or S    volume down
;   Esc          close (it also closes by itself after a few seconds)
; Caps Lock on its own still works normally.

#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent

; ---------- Settings you can change ----------
AutoHideMs := 8000   ; hide after this many milliseconds with no input (0 = never)
VolumeStep := 4      ; how much one volume press changes the system volume, in percent
MenuY := 48          ; distance from the top of the screen, in pixels

; ---------- Colors (match Afterglow) ----------
ColBase := "12131C"
ColInk := "F4F2F7"
ColMuted := "A9A6B8"
ColFaint := "6E6B7E"
ColAccent := "FF8FA3"
ColChip := "262735"

; ---------- Icons (Segoe MDL2 Assets, built into Windows 10 and 11) ----------
IconPrev := Chr(0xE892)
IconPlay := Chr(0xE768)
IconPause := Chr(0xE769)
IconNext := Chr(0xE893)
IconVolDown := Chr(0xE993)
IconVolUp := Chr(0xE995)

Visible := false

; ---------- Build the menu window ----------
; +E0x08000000 keeps the game focused while the menu is showing.
QM := Gui("+AlwaysOnTop -Caption +ToolWindow +E0x08000000", "Afterglow quick menu")
QM.BackColor := ColBase
QM.MarginX := 24
QM.MarginY := 18

QM.SetFont("s9 c" ColFaint, "Segoe UI")
StatusText := QM.AddText("w400 r1", "Afterglow")
QM.SetFont("s16 bold c" ColInk, "Segoe UI")
SongText := QM.AddText("w400 r1 y+2 0x4000", "Nothing playing")      ; 0x4000 adds "..." to long names
QM.SetFont("s10 norm c" ColMuted, "Segoe UI")
ArtistText := QM.AddText("w400 r1 y+0 0x4000", "")

QM.SetFont("s14 c" ColInk, "Segoe MDL2 Assets")
BtnPrev := QM.AddText("x24 y+16 w56 h40 Center 0x200 Background" ColChip, IconPrev)
BtnPlay := QM.AddText("x+10 yp w72 h40 Center 0x200 c" ColBase " Background" ColAccent, IconPlay)
BtnNext := QM.AddText("x+10 yp w56 h40 Center 0x200 Background" ColChip, IconNext)
BtnDown := QM.AddText("x+28 yp w44 h40 Center 0x200 Background" ColChip, IconVolDown)
BtnUp := QM.AddText("x+8 yp w44 h40 Center 0x200 Background" ColChip, IconVolUp)
QM.SetFont("s10 c" ColMuted, "Segoe UI")
VolText := QM.AddText("x+10 yp w52 h40 0x200", "")

QM.SetFont("s9 c" ColFaint, "Segoe UI")
QM.AddText("x24 y+14 w400", "Space play/pause     ← →  skip     ↑ ↓  volume     Esc close")

; Thin accent stripe down the left edge (sized when shown).
AccentBar := QM.AddText("x0 y0 w4 h10 Background" ColAccent)

BtnPrev.OnEvent("Click", (*) => Act("prev"))
BtnPlay.OnEvent("Click", (*) => Act("play"))
BtnNext.OnEvent("Click", (*) => Act("next"))
BtnDown.OnEvent("Click", (*) => Act("down"))
BtnUp.OnEvent("Click", (*) => Act("up"))

; Rounded corners on Windows 11 (ignored on Windows 10).
try DllCall("dwmapi\DwmSetWindowAttribute", "Ptr", QM.Hwnd, "UInt", 33, "Int*", 2, "UInt", 4)

A_IconTip := "Afterglow quick menu (Caps Lock + Tab)"

; ---------- Hotkeys ----------
CapsLock & Tab::ToggleMenu()
; Using Caps Lock in a shortcut turns off its normal job, so put it back.
CapsLock::SetCapsLockState(GetKeyState("CapsLock", "T") ? "Off" : "On")

#HotIf Visible
Space::Act("play")
Left::Act("prev")
a::Act("prev")
Right::Act("next")
d::Act("next")
Up::Act("up")
w::Act("up")
Down::Act("down")
s::Act("down")
Esc::HideMenu()
#HotIf

; ---------- How it works ----------

ToggleMenu() {
    if Visible
        HideMenu()
    else
        ShowMenu()
}

ShowMenu() {
    global Visible
    Refresh()
    QM.Show("Hide AutoSize")              ; measure it first
    QM.GetPos(, , &w, &h)
    AccentBar.Move(0, 0, 4, h)
    QM.Show("NoActivate x" ((A_ScreenWidth - w) // 2) " y" MenuY)
    Visible := true
    SetTimer(Refresh, 500)
    ResetAutoHide()
}

HideMenu(*) {
    global Visible
    QM.Hide()
    Visible := false
    SetTimer(Refresh, 0)
    SetTimer(HideMenu, 0)
}

ResetAutoHide() {
    if AutoHideMs > 0
        SetTimer(HideMenu, -AutoHideMs)
}

Act(what) {
    switch what {
        case "play": Send("{Media_Play_Pause}")
        case "next": Send("{Media_Next}")
        case "prev": Send("{Media_Prev}")
        case "up": SoundSetVolume("+" VolumeStep)
        case "down": SoundSetVolume("-" VolumeStep)
    }
    ResetAutoHide()
    SetTimer(RefreshSoon, -350)          ; give Afterglow a moment to update its title
}

RefreshSoon() {
    if Visible
        Refresh()
}

Refresh() {
    info := FindAfterglow()
    if !IsObject(info) {
        SetText(StatusText, "Afterglow isn't open")
        SetText(SongText, "Open Afterglow to play music")
        SetText(ArtistText, "")
        SetText(BtnPlay, IconPlay)
    } else if info.song = "" {
        SetText(StatusText, "Afterglow")
        SetText(SongText, "Nothing playing")
        SetText(ArtistText, "Pick something in Afterglow")
        SetText(BtnPlay, IconPlay)
    } else {
        SetText(StatusText, info.paused ? "Paused" : "Now playing")
        SetText(SongText, info.song)
        SetText(ArtistText, info.artist)
        SetText(BtnPlay, info.paused ? IconPlay : IconPause)
    }
    SetText(VolText, Round(SoundGetVolume()) "%")
}

; Only change text that actually changed, so the menu doesn't flicker.
SetText(ctrl, text) {
    if ctrl.Value != text
        ctrl.Value := text
}

; Afterglow's window title looks like "Song · Artist | Afterglow"
; (or "Paused: Song · Artist | Afterglow"), and just "Afterglow" when idle.
FindAfterglow() {
    idle := ""
    for hwnd in WinGetList("ahk_class Chrome_WidgetWin_1") {
        title := WinGetTitle(hwnd)
        if RegExMatch(title, "^(?:Afterglow - )?(Paused: )?(.+?) \x{00B7} (.+) \| Afterglow", &m)
            return { song: m[2], artist: m[3], paused: m[1] != "" }
        if RegExMatch(title, "^Afterglow(?: - (?:Google Chrome|Microsoft.*Edge))?$")
            idle := { song: "", artist: "", paused: true }
    }
    return idle
}
