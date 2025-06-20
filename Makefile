UUID=`jq -r '.uuid' metadata.json`
TAG=`jq -r '."version-name"' metadata.json`

check:
	@printf "==> checking the working tree... "
	@sh -c 'if [ -z "`git status --porcelain=v1`" ]; then printf "clean\n"; else printf "working tree is dirty, please, commit changes\n" && false; fi'

tag:
	@printf "==> tagging...\n"
	@git tag -a "v$(TAG)" -m "Release $(TAG)"

pub:
	@printf "==> pushing...\n"
	@git push --atomic origin main "v$(TAG)"

install:
	@printf "==> installing locally...\n"
	@gnome-extensions install --force $(UUID).shell-extension.zip
	@printf "Restart Gnome Shell session\n"

uninstall:
	@printf "==> uninstalling...\n"
	@gnome-extensions uninstall $(UUID)

reinstall: uninstall install
	@printf "==> reinstalling locally...\n"

clean:
	@printf "==> cleaning...\n"
	@rm -f $(UUID).shell-extension.zip
	@rm -f schemas/gschemas.compiled

build: clean
	@printf "==> packaging...\n"
	@gnome-extensions pack --force \
	--extra-source="LICENSE" \
	--extra-source="icons"

release: check tag pub
	@printf "\nPublished at %s\n\n" "`date`"

.DEFAULT_GOAL := build
.PHONY: check tag pub install uninstall reinstall clean build release
