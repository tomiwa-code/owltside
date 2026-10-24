class ShellState {
	mobileNav = $state(false);
	palette = $state(false);
	accountMenu = $state(false);

	openNav() {
		this.mobileNav = true;
	}
	closeNav() {
		this.mobileNav = false;
	}
	openPalette() {
		this.palette = true;
		this.mobileNav = false;
	}
	closePalette() {
		this.palette = false;
	}
	toggleAccount() {
		this.accountMenu = !this.accountMenu;
	}
}

export const shell = new ShellState();
