openshift-multi-database
========================

Using several mysql (or postgresql, ...) in one application was not possible in OpenShift <https://lists.openshift.redhat.com/openshift-archives/dev/2013-July/msg00003.html>

Now you can do it with a little trick.

Just use a downloaded cartridge generated by this app: 

* http://multidb-filirom1.rhcloud.com/?name=mysql1&cartridge-short-name=MYSQL1&url=https://raw.github.com/Filirom1/openshift-origin-cartridge-mysql/master/metadata/manifest.yml
* http://multidb-filirom1.rhcloud.com/?name=mysql2&cartridge-short-name=MYSQL2&url=https://raw.github.com/Filirom1/openshift-origin-cartridge-mysql/master/metadata/manifest.yml

Please note that you have to specifie:

* `name`: the new name of your cartridge in the manifest.yml
* `cartridge-short-name`: the new cartridge-short-name in the manifest.yml. It will also replace and rename every references of the old cartridge-short-name
* `url`: the URL of your manifest.yml

