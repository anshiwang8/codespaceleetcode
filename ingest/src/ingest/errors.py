"""Errors the CLI reports as a plain message instead of a traceback."""


class IngestError(Exception):
    """A pipeline failure with a message written for the person running it."""
