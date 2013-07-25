snowflake-experiments
=====================

The scala version is obvisouly the original.

The python version was the best I found in py land.

The bigger parts are two javascript implementations: one that can run entirely in the browser using a Long library adapted by from google closure and the other uses a node addon to handle all of the 64bit integer work on the C side instead, which is a few 1000 times faster than the browser implementation.