"""The game's own routes: served to anyone, because the game asks nobody to sign in.

This package names no URL segment, so its modules hang directly off the API prefix: ``scores.py``
is ``/api/scores``.

The empty ``dependencies`` below is the access declaration, not an omission. An arcade high score
board has no accounts and no per-caller data: a player types three initials and the board is the
same for everyone who loads the page. Anything that does grow a notion of a caller belongs in its
own group with its own rule, not here.
"""

from fastapi import params

segment = ""

dependencies: tuple[params.Depends, ...] = ()
