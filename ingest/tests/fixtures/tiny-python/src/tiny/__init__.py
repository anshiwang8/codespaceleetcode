"""A package whose functions live in __init__.py as well as in modules."""

from .core import helper
from .models import Session

VERSION = "1.0"


def make_session():
    helper(1)
    return Session()
