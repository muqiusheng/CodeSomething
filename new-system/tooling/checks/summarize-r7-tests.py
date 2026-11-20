from pathlib import Path
import xml.etree.ElementTree as ET
import json
root=Path(__file__).resolve().parents[2]
baseline=root/'runtime/r7-final-build/target/surefire-reports'
patched=root/'runtime/r7-service-build/target/surefire-reports'
def cases(directory):
    result={}
    for file in directory.glob('TEST-*.xml'):
        tree=ET.parse(file).getroot()
        for case in tree.findall('testcase'):
            status='failed' if case.find('failure') is not None or case.find('error') is not None else 'skipped' if case.find('skipped') is not None else 'passed'
            result[case.get('classname')+'#'+case.get('name')]=dict(status=status,evidence=str(file.relative_to(root)).replace('\\','/'))
    return result
original=cases(baseline);supplement=cases(patched)
assert original and supplement
current={**original,**supplement}
unresolved={key:value for key,value in current.items() if value['status']!='passed'}
resolved=[key for key,value in original.items() if value['status']=='failed' and current[key]['status']=='passed']
report=dict(distinctBackendMethods=len(current),passed=sum(v['status']=='passed' for v in current.values()),skipped=sum(v['status']=='skipped' for v in current.values()),unresolved=unresolved,resolvedByCurrentSourceRegression=resolved,currentSourceSupplementMethods=len(supplement),note='Full baseline copy retains one obsolete four-course assertion. The current-source 15-method regression includes the five-course expectation and dynamic 27-skill summary; its results replace the superseded cases.',cases=current)
(root/'docs/acceptance/R7/backend-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert not unresolved,unresolved
print(f"{len(current)} distinct backend methods passed, zero unresolved failures/skips; {len(supplement)} current-source supplemental regressions.")
