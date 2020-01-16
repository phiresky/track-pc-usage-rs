# track pc usage

track which programs is used how much and stores data in database. Inspired by [arbtt](https://arbtt.nomeata.de/), which I used previously.

## todo

-   analyse data (ui / graphs etc)
-   autoimport more detailed / other data
    -   (phone usage via [App Usage](https://play.google.com/store/apps/details?id=com.a0soft.gphone.uninstaller&hl=en))
    -   browser usage via own firefox/chrome `permanent-history-webextension`, tbd
    -   mpv usage via own mpv tracking lua script `.config/mpv/scripts/logall.lua` tbu
    -   shell usage via zsh-histdb
-   make non-crap
-   look at similar tools, e.g. https://www.raymond.cc/blog/check-application-usage-times-personal-activity-monitor/

## philosophy

Store as much information in an as raw as possible format in the capture step. Interpret / make it usable later in the analyse step. This prevents accidentally missing interesting information when saving and can allow reinterpretions in unexpected ways later. Redundancies in the data which cause large storage requirements will be solved with compression later.

## todo:

remove Defaults from deserializing in x11.rs

## notes

db rows:

-   timestamp
-   sampling method used
-   data

time sampling. decide between random sampling, stratified sampling or grid (?) sampling

## Data Sources Setup

### Firefox

Install https://addons.mozilla.org/en-US/firefox/addon/add-url-to-window-title/ and enable "Show the full URL"

### VS Code

Open your user settings and set `window.title` to `${dirty}${activeEditorShort}${separator}${rootName}${separator}|project=${rootPath}|file=${activeEditorMedium}| VSCode`

### Shell / Zsh

Todo: look at https://arbtt.nomeata.de/doc/users_guide/effective-use.html

1. Add / Install [zsh-histdb](https://github.com/larkery/zsh-histdb)

2. Add the following to your zshrc:

    ```zsh
    # set window title for track-pc-usage-rs
    # adopted from https://github.com/ohmyzsh/ohmyzsh/blob/master/lib/termsupport.zsh

    function title {
        setopt prompt_subst
        : ${2=$1}
        case "$TERM" in
            cygwin|xterm*|putty*|rxvt*|ansi)
                print -Pn "\e]2;$2:q\a" # set window name
                # print -Pn "\e]1;$1:q\a" # set tab name
            ;;
            screen*|tmux*)
                print -Pn "\ek$1:q\e\\" # set screen hardstatus
            ;;
            *)
                echo unsupported for setting title
            ;;
        esac
    }
    function title_precmd {
        title_preexec '' ''
    }
    function title_preexec {
        # http://zsh.sourceforge.net/Doc/Release/Expansion.html
        # http://zsh.sourceforge.net/Doc/Release/Prompt-Expansion.html#Prompt-Expansion
        local cwd="$(print -P '%~')"
        local user="$(print -P '%n@%m')"
        local LINE="$2"
        local cmd="$(print -P '%100>...>$LINE%<<')"

        title '' '{"cwd":${(qqq)cwd},"histdb":$HISTDB_SESSION,"usr":${(qqq)user},"cmd":${(qqq)cmd}}'
    }
    add-zsh-hook precmd title_precmd
    add-zsh-hook preexec title_preexec
    ```
