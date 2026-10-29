from .base import REGISTRY, Ctx, ToolError  # noqa: F401

# Importing the modules registers their tools.
from . import pages, annotate, convert, optimize, intel, workflow  # noqa: F401,E402
